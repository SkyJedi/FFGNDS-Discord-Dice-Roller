const d100 = require('../').modifierRoll;
const emoji = require('../').emoji;
const { getParams } = require('../');

// Each chart is a plain array of {max, diamonds, name, description} entries, sorted ascending
// by max, so they're easy to read/edit as data instead of a giant switch statement, and other
// modules (e.g. char.js's crit tracking) can pull just the name via critName()/shipCritName()
// without parsing rendered text. `description` is a plain string, or a function of channelEmoji
// for the handful of entries that embed a die emoji (e.g. "Add {black} to his next check").
const CRIT_CHART = [
    { max: 5, diamonds: 0, name: 'Minor Nick', description: 'The target suffers 1 strain.' },
    { max: 10, diamonds: 0, name: 'Slowed Down', description: 'The target can only act during the last allied Initiative slot on his next turn.' },
    { max: 15, diamonds: 0, name: 'Sudden Jolt', description: 'The target drops whatever is in hand.' },
    { max: 20, diamonds: 0, name: 'Distracted', description: 'The target cannot perform a free maneuver during his next turn.' },
    { max: 25, diamonds: 0, name: 'Off-Balance', description: (channelEmoji) => `Add ${emoji('black', channelEmoji)} to his next skill check.` },
    { max: 30, diamonds: 0, name: 'Discouraging Wound', description: 'Flip one light side Destiny point to a dark side Destiny Point (reverse if NPC).' },
    { max: 35, diamonds: 0, name: 'Stunned', description: 'The target is staggered until the end of his next turn.' },
    { max: 40, diamonds: 0, name: 'Stinger', description: 'Increase difficulty of next check by one.' },
    { max: 45, diamonds: 1, name: 'Bowled Over', description: 'The target is knocked prone and suffers 1 strain.' },
    { max: 50, diamonds: 1, name: 'Head Ringer', description: 'The target increases the difficulty of all Intellect and Cunning Checks by one until the end of the encounter.' },
    { max: 55, diamonds: 1, name: 'Fearsome Wound', description: 'The target increases the difficulty of all Presence and Willpower checks by one until the end of the encounter.' },
    { max: 60, diamonds: 1, name: 'Agonizing Wound', description: 'The target increases the difficulty of all Brawn and Agility checks by one until the end of the encounter.' },
    { max: 65, diamonds: 1, name: 'Slightly Dazed', description: 'The target is disoriented until the end of the encounter.' },
    { max: 70, diamonds: 1, name: 'Scattered Senses', description: (channelEmoji) => `The target removes all ${emoji('blue', channelEmoji)} from skill checks until end of encounter.` },
    { max: 75, diamonds: 1, name: 'Hamstrung', description: 'The target loses his free maneuver until the end of the encounter.' },
    { max: 80, diamonds: 1, name: 'Overpowered', description: 'The target leaves himself open, and the attacker may immediately attempt another free attack against him, using the exact same pool as the original attack.' },
    { max: 85, diamonds: 1, name: 'Winded', description: 'Until the end of the encounter, the target cannot voluntarily suffer strain to activate any abilities or gain additional maneuvers.' },
    { max: 90, diamonds: 1, name: 'Compromised', description: 'Increase difficulty of all skill checks by one until the end of the encounter.' },
    { max: 95, diamonds: 2, name: 'At the Brink', description: 'The target suffers 1 strain each time he performs an action.' },
    { max: 100, diamonds: 2, name: 'Crippled', description: 'One of the target’s limbs (selected by the GM) is crippled until healed or replaced. Increase difficulty of all checks that require use of that limb by one.' },
    { max: 105, diamonds: 2, name: 'Maimed', description: (channelEmoji) => `One of the target’s limbs (selected by the GM) is permanently lost. Unless the target has a cybernetic replacement, the target cannot perform actions that would require the use of that limb. All other actions gain ${emoji('black', channelEmoji)}.` },
    { max: 110, diamonds: 2, name: 'Horrific Injury', description: 'Randomly roll 1d100 to determine one of the target\'s characteristics—1-30 for Brawn, 31-60 for Agility, 61-70 for Intellect, 71-80 for Cunning, 81-90 for Presence, 91-100 for Willpower. Until this Critical Injury is healed, treat that characteristic as one point lower.' },
    { max: 115, diamonds: 2, name: 'Temporarily Lame', description: 'Until this Critical Injury is healed, the target cannot perform more than one maneuver during his turn.' },
    { max: 120, diamonds: 2, name: 'Blinded', description: 'The target can no longer see. Upgrade the difficulty of all checks twice. Upgrade the difficulty of Perception and Vigilance checks three times.' },
    { max: 125, diamonds: 2, name: 'Knocked Senseless', description: 'The target is staggered for the remainder of the encounter.' },
    { max: 130, diamonds: 3, name: 'Gruesome Injury', description: 'Randomly roll 1d100 to determine one of the target\'s characteristics—1-30 for Brawn, 31-60 for Agility, 61-70 for Intellect, 71-80 for Cunning, 81-90 for Presence, 91-100 for Willpower. That characteristic is permanently reduced by one, to a minimum of one.' },
    { max: 140, diamonds: 3, name: 'Bleeding Out', description: 'Every round, the target suffers 1 wound and 1 strain at the beginning of his turn. For every five wounds he suffers beyond his wound threshold, he suffers one additional Critical Injury. Roll on the chart, suffering the injury (if he suffers this result a second time due to this, roll again).' },
    { max: 150, diamonds: 3, name: 'The End is Nigh', description: 'The target will die after the last Initiative slot during the next round.' },
    { max: Infinity, diamonds: 0, name: 'Dead', description: 'Complete, obliterated death.' }
];

const SHIP_CRIT_CHART = [
    { max: 9, diamonds: 0, name: 'Mechanical Stress', description: 'The ship or vehicle suffers one point of system strain.' },
    { max: 18, diamonds: 0, name: 'Jostled', description: 'A small explosion or impact rocks the vehicle. All crew members suffer one strain and are disoriented for one round.' },
    { max: 27, diamonds: 0, name: 'Losing Power to Shields', description: 'Decrease defense in affected defense zone by one until the Critical Hit is repaired. If the ship or vehicle has no defense, suffer one point of system strain.' },
    { max: 36, diamonds: 0, name: 'Knocked Off Course', description: 'A particularly strong blast or impact sends the ship or vehicle careening off in a new direction. On his next turn, the pilot cannot execute any maneuvers and must make a Piloting check to regain control. The difficulty of this check depends on his current speed.' },
    { max: 45, diamonds: 0, name: 'Tailspin', description: (channelEmoji) => `All firing from the ship or vehicle suffers ${emoji('black', channelEmoji)} ${emoji('black', channelEmoji)} dice until the end of the pilot’s next turn. All crew members are immobilized until the end of the pilot’s next turn.` },
    { max: 54, diamonds: 0, name: 'Component Hit', description: 'One component of the attacker’s choice is knocked offline, and is rendered inoperable until the end of the following round. For a list of ship components, see EotE Core Rulebook Table 7-10**: Small Ship or Vehicle Components or Table 7-11**: Large Ship or Vehicle Components depending on target ship silhouette.' },
    { max: 63, diamonds: 1, name: 'Shields Failing', description: 'Reduce defense in all defense zones by one point until the Critical Hit is repaired. If the ship or vehicle has no defense, suffer two points of system strain.' },
    { max: 72, diamonds: 1, name: 'Navicomputer Failure', description: 'The navicomputer (or in the case of a ship without a navicomputer, its R2 unit) fails and the ship cannot make the jump to hyperspace until the Critical Hit is repaired. If the ship or vehicle is without a hyperdrive, the vehicle or ship’s navigation systems fail, leaving it flying or driving blind, unable to tell where it is or where it’s going.' },
    { max: 81, diamonds: 1, name: 'Power Fluctuations', description: 'The ship or vehicle is beset by random power surges and outages. The pilot cannot voluntarily inflict system strain on the ship (to gain an extra starship maneuver, for example), until this Critical Hit is repaired.' },
    { max: 90, diamonds: 2, name: 'Shields Down', description: 'Decrease defense in affected defense zone to zero, and decrease defense in all other defense zones by one until this Critical Hit is repaired. While the defense of the affected defense zone cannot be restored until the Critical Hit is repaired, defense can be assigned to protect that defense zone from other zones as usual. If the ship or vehicle is without defense, suffer four points of system strain.' },
    { max: 99, diamonds: 2, name: 'Engine Damaged', description: 'The ship or vehicle’s maximum speed is reduced by one point, to a minimum of one, until the Critical Hit is repaired.' },
    { max: 108, diamonds: 2, name: 'Shield Overload', description: 'The ship’s shields completely fail. Decrease the defense of all defense zones to zero. This Critical Hit cannot be repaired until the end of the encounter, and the ship suffers two points of system strain. If the ship or vehicle is without defense, reduce armor by 1 until the Critical Hit is repaired.' },
    { max: 117, diamonds: 2, name: 'Engines Down', description: 'The ship or vehicle’s maximum speed is reduced to zero until the Critical Hit is repaired, although it continues on its present course thanks to momentum. In addition, the ship cannot execute any maneuvers until the Critical Hit is repaired.' },
    { max: 126, diamonds: 2, name: 'Major System Failure', description: 'One component of the attacker’s choice is heavily damaged, and is inoperable until the Critical Hit is repaired. For a list of ship components, see EotE Core Rulebook Table 7-10**: Small Ship or Vehicle Components or Table 7-11**: Large Ship or Vehicle Components depending on target ship silhouette.' },
    { max: 133, diamonds: 3, name: 'Major Hull Breach', description: 'A huge, gaping tear is torn in the ship’s hull and it depressurizes. For ships and vehicles of silhouette 4 and smaller, the entire ship depressurizes in a number of rounds equal to the ship’s silhouette. Ships and vehicles of silhouette 5 and larger tend to be highly compartmentalized and have many safeguards against depressurization. These ships don’t completely depressurize, but parts do (the specifics of which parts depressurize is up to the GM; however each section of the ship or vehicle that does lose air does so in a number of rounds equal to the vehicle’s silhouette). Vehicles and ships operating in an atmosphere can better handle this Critical Hit. However, the huge tear still inflicts penalties, causing the vehicle to suffer the Destabilized Critical Hit instead.' },
    { max: 138, diamonds: 3, name: 'Destabilized', description: 'The ship or vehicle’s structural integrity is seriously damaged. Reduce the ship or vehicle’s hull trauma threshold and system strain threshold to half their original values until repaired.' },
    { max: 144, diamonds: 3, name: 'Fire!', description: 'Fire rages through the ship. The ship or vehicle immediately takes two points of system strain, and anyone caught in the fire takes damage as discussed on page 214 of the EotE Core Rulebook. A fire can be put out with some quick thinking and appropriate skill, Vigilance and/or Cool checks at the Game Master’s discretion. Once going, a fire takes one round per two of the ship’s silhouette points to put out.' },
    { max: 153, diamonds: 3, name: 'Breaking Up', description: 'The vehicle or ship has suffered so much damage that it begins to come apart at its seams, breaking up and disintegrating around the crew. At the end of the following round, the ship is completely destroyed and the surrounding environment is littered with debris. Anyone aboard the ship or vehicle has one round to get to an escape pod, bail out, or dive for the nearest hatch before they are lost.' },
    { max: Infinity, diamonds: 0, name: 'Vaporized', description: 'The ship or vehicle is completely destroyed, consumed in a particularly large and dramatic fireball. Nothing survives.' }
];

const findCritEntry = (chart, total) => chart.find(entry => total <= entry.max) || chart[chart.length - 1];

const critName = (total) => findCritEntry(CRIT_CHART, total).name;
const shipCritName = (total) => findCritEntry(SHIP_CRIT_CHART, total).name;

const buildCritText = (chart, total, channelEmoji) => {
    const entry = findCritEntry(chart, total);
    const description = typeof entry.description === 'function' ? entry.description(channelEmoji) : entry.description;
    return `${emoji('purplediamond', channelEmoji).repeat(entry.diamonds)}**${entry.name}**: ${description}`;
};

const textCrit = (total, channelEmoji) => buildCritText(CRIT_CHART, total, channelEmoji);
const textShipCrit = (total, channelEmoji) => buildCritText(SHIP_CRIT_CHART, total, channelEmoji);

const crit = ({ interaction, channelEmoji }) => {
    //required lazily to avoid a load-order-dependent circular require with ../../index
    //(see modules/functions.js for the full explanation)
    const main = require('../../index');
    const params = getParams(interaction);
    if (params.length > 0 && params[0].includes('?')) {
        const query = params[0].replace(/\D/g, '');
        main.sendMessage({ interaction, text: 'Crit ' + query + ': ' + textCrit(query, channelEmoji) });
        return;
    }
    const total = d100(100, params, interaction);
    main.sendMessage({ interaction, text: 'Crit ' + total + ': ' + textCrit(total, channelEmoji) });
};

const shipcrit = ({ interaction, channelEmoji }) => {
    const main = require('../../index');
    const params = getParams(interaction);
    if (params.length > 0 && params[0].includes('?')) {
        const query = params[0].replace(/\D/g, '');
        main.sendMessage({ interaction, text: 'Ship Crit ' + query + ': ' + textShipCrit(query, channelEmoji) });
        return;
    }
    const total = d100(100, params, interaction);
    main.sendMessage({ interaction, text: 'Ship Crit ' + total + ': ' + textShipCrit(total, channelEmoji) });
};

exports.crit = crit;
exports.shipcrit = shipcrit;
exports.textCrit = textCrit;
exports.textShipCrit = textShipCrit;
exports.critName = critName;
exports.shipCritName = shipCritName;
exports.CRIT_CHART = CRIT_CHART;
exports.SHIP_CRIT_CHART = SHIP_CRIT_CHART;
