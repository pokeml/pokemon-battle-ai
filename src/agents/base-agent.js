/**
 * The base class for all battle agents. Currently only for single battle formats.
 * Based on https://github.com/Zarel/Pokemon-Showdown/blob/master/sim/battle-stream.js#L221.
 */

'use strict';

const colors = require('colors');
const Battle = require('../state-tracking/battle');
const splitFirst = require('../../utils/utils').splitFirst;

const battleUpdateCommands = new Set(['move', 'switch', 'teampreview']); // TODO: add more commands

class Agent {
	/**
	 * @param {ObjectReadWriteStream} playerStream
	 */
	constructor(playerStream, debug = false) {
		this._stream = playerStream;
        this._currentRequest = null;
        this._receivedBattleUpdate = false;
        this._receivedRequest = false;
        this._battle = new Battle();

        this.log = /** @type {string[]} */ ([]);
		this.debug = debug;

		this._listen();
	}

	async _listen() {
		let chunk;
		while ((chunk = await this._stream.read())) {
			this._receive(chunk);
		}
	}

    /**
     * @param {string} chunk
     */
    _receive(chunk) {
		for (const line of chunk.split('\n')) {
			this._receiveLine(line);
		}
        if (this._receivedRequest && this._receivedBattleUpdate) {
            this._receivedBattleUpdate = false;
            this._receivedRequest = false;
            if (this._currentRequest.wait) return;
            const actionSpace = this._getActionSpace();
            const action = this.act(this._battle, actionSpace);
            if (!actionSpace.includes(action)) {
                throw new Error(`invalid action: ${action}`);
            }
            this._choose(action);
        }
	}

    /**
	 * @param {string} line
	 */
	_receiveLine(line) {
		if (this.debug) console.log(`${line}`.gray);
		if (line.charAt(0) !== '|') return;
		const [cmd, rest] = splitFirst(line.slice(1), '|');
        if (battleUpdateCommands.has(cmd)) {
            this._receivedBattleUpdate = true;
        }
		if (cmd === 'request') {
            this._receivedRequest = true;
            this._currentRequest = JSON.parse(rest);
            return;
		} else if (cmd === 'error') {
            throw new Error(rest);
        }
        this._battle.activityQueue.push(line);
		this.log.push(line);
	}

    /**
     * Return a list of all possible actions. Works only for single battles.
     * TODO: adapt for double and triple battles
     */
    _getActionSpace() {
        const request = this._currentRequest;
        if (request.forceSwitch) {
			const pokemon = request.side.pokemon;
            const switches = [1, 2, 3, 4, 5, 6].filter(i => (
                // not active
                !pokemon[i - 1].active &&
                // not fainted
                !pokemon[i - 1].condition.endsWith(' fnt')
            ));
            return switches.map(i => `switch ${i}`);
		} else if (request.active) {
            const active = request.active[0];
            const pokemon = request.side.pokemon;
            let actionSpace = [];
            // moves
            const moves = [1, 2, 3, 4].slice(0, active.moves.length).filter(i => (
                // not disabled
                !active.moves[i - 1].disabled
            ));
            actionSpace.push(...moves.map(i => `move ${i}`));
            // moves + mega evo
            if (active.canMegaEvo) {
                actionSpace.push(...moves.map(i => `move ${i} mega`));
            }
            // zmoves
            if (active.canZMove) {
                const zmoves = [1, 2, 3, 4].slice(0, active.canZMove.length).filter(i =>
                    active.canZMove[i - 1]
                );
                actionSpace.push(...zmoves.map(i => `move ${i} zmove`));
            }
            // switches
            const switches = [1, 2, 3, 4, 5, 6].filter(i => (
                // not active
                !pokemon[i - 1].active &&
                // not fainted
                !pokemon[i - 1].condition.endsWith(' fnt')
            ));
            actionSpace.push(...switches.map(i => `switch ${i}`));
            return actionSpace;
		} else if (request.wait) {
            return [];
        }
        return ['default'];
    }

	/**
	 * Write a choice to the stream.
     *
	 * @param {string} choice
	 */
	_choose(choice) {
		this._stream.write(choice);
	}

    /**
     * Select an action.
     *
     * @param {Battle} battle
     * @param {string[]} actionSpace
     * @return {string} action
     */
    act(battle, actionSpace) {
        throw new Error('must be overridden by subclass');
    }
}

module.exports = Agent;
