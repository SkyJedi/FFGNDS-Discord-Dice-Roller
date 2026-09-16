const dice = require("./").dice;
const config = require("../config.json");
const { getParams } = require('./functions');

async function poly(interaction) {
	//required lazily to avoid a load-order-dependent circular require with ../index
	//(see modules/functions.js for the full explanation)
	const main = require('../index');
	const params = getParams(interaction);
	let text = 'rolled:';
	params.forEach(unit => {
		let modifier = 0;
		text += `  \`${unit}\` (`;

		if (unit.includes("+")) {
			for (let k = 0; k < unit.length; k++) {
				if (unit[k] === '+') {
					modifier = +unit.slice(k + 1);
					unit = unit.slice(0, k - unit.length);
					break;
				}
			}
		}

		if (unit.includes("-")) {
			for (let l = 0; l < unit.length; l++) {
				if (unit[l] === '-') {
					modifier = -(+unit.slice(l + 1));
					unit = unit.slice(0, l - unit.length);
					break;
				}
			}
		}

		let position = 0;

		for (let i = 0; i < unit.length; i++) {
			if (unit[i] === 'd') {
				position = i;
				break;
			}
		}
		let dieAmount = unit.slice(0, position);
		if (!dieAmount) dieAmount = 1;
		let dieType = unit.slice(position + 1);
		let total = 0;
		let rolls = [];

		if (dieAmount > config.maxRollsPerDie) {
			main.respond(interaction, `Roll exceeds max roll per die limit of ${config.maxRollsPerDie}. Please try again.`);
			return;
		}

		for (let j = 0; j < dieAmount; j++) {
			rolls.push(dice(dieType));
		}

		rolls.forEach(roll => {
			text += `${roll} + `;
			total += roll;
		});

		total += modifier;
		text = `${text.slice(0, -3)})`;
		if (modifier > 0) text += ` + ${modifier}`;
		if (modifier < 0) text += ` - ${Math.abs(modifier)}`;
		if (text.length < 1500) {
			text += ` = ${total}.`;
		} else text = `Too many dice to display.  Total roll is ${total}.`;
	});
	if (text.endsWith('.')) await main.respond(interaction, text);
}

module.exports = poly;
