# FFGNDS-Discord-Dice-Roller
CREDIT: Vampwood for conceiving the client, and SkyJedi for substantial contributions to the project.

A Discord Bot Companion for the Star Wars : Edge of the Empire (SW:EotE), Age of Rebellion (AoR) and Force and Destiny (FnD) RPGs as well as Genesys, and Legend of the Five Rings (L5R) RPGs

## Usage

The bot is driven entirely by Discord slash commands. Most commands take a single free-text
`input` option (and `/roll` also takes an optional `text` label) - Discord will show the expected
format as you type.

- `/swrpg`, `/genesys`, `/l5r`  switches dice and functionality between games.

## Star Wars (SW)/Genesys commands

- `/roll input:` rolls any combination of SWRPG/Genesys dice and returns the cancelled results
  - You may add a `text:` option to give the roll a name like `Initiative`
  - Dice results and cancellations are computed by the bot so you don't have to!  
  - Only the remaining symbols will be displayed.

### Dice Identifiers

- `y`/`pro` = Yellow/Proficiency
- `g`/`a` = Green/Ability
- `b`/`boo` = Blue/Boost
- `blk`/`k`/`sb`/`s` = Black/Setback
- `r`/`c` = Red/ Challenge
- `p`/`diff` = Purple/ Difficulty
- `w`/`f` = White/Force

Note: if you use the `/roll input:yyyggbbd` method you must use the single character dice identifiers

### Examples

- `/roll input:yyyggbbd text:Blast Him!`
- `/roll input:3pro 2a 2boo 2dif 2sb text:Delusions of Grandeur`
- `/poly` rolls any combination of polyhedral dice with modifier
  - `/poly input:1d4 2d6+1 1d100-60`
- `/destiny` (or `/story` in Genesys channels) sets and manages the Destiny Balance for the group
  - `/destiny` : view the destiny pool
  - `/destiny input:roll` : rolls one Force Die and adds it to current destiny pool
  - `/destiny input:light` / `input:dark` : uses light or dark side point
  - `/destiny input:set #l #d` : sets destiny pool
  - `/destiny input:set lldd` : sets destiny pool
  - `/destiny input:reset` : resets the destiny pool
- `/crit` rolls a d100 with optional modifier and displays result of the critical hit.
  - `/crit input:+X`
  - `/crit input:-X`
- `/shipcrit` rolls a d100 with optional modifier and displays result of the ship critical hit.
  - `/shipcrit input:+X`
  - `/shipcrit input:-X`
- `/character` Opens an interactive character manager - no options to type, just buttons:
  - **Add** : opens a form for name, max wounds, max strain, and credits, then creates the character
  - **Remove** : lists each character with a Remove button; asks you to confirm before deleting
  - **Modify** : lists each character as a button; picking one shows their status with +/- buttons
    for wounds and strain, plus an Apply button once you have pending changes
  - **List** : displays every character in the channel
- `/initiative` initiative tracker and roller
  - `/initiative` : shows current initiative order
  - `/initiative input:roll dice npc/pc` : rolls your initiative dice and adds character to the order. ie `/initiative input:roll yygg pc`
  - `/initiative input:next` : moves to next initiative slot
  - `/initiative input:previous` : moves to previous initiative slot
  - `/initiative input:set` : manually set initiative order before any turns occur
  - `/initiative input:modify` : manually alter initiative order mid-round
  - `/initiative input:reset` : resets the initiative order
  - `/initiative input:remove x` : remove a slot where x is the position
- `/species` : picks a random species
- `/obligation`, `/duty` : gathers all the obligation/duty entered with /character and rolls to trigger
- `/reroll`: modifies the previous roll
  - `/reroll input:same` : rolls the same pool again
  - `/reroll input:add DiceIdentifiers` : roll additional dice and adds them to the pool
    ie `/reroll input:add y`
  - `/reroll input:remove DiceIdentifiers` : remove random dice of the designated color
    ie `/reroll input:remove g`
  - `/reroll input:select DiceColor/DicePosition` : rerolls specified dice
    ie `/reroll input:select Y3 P1` : rerolls only the 3rd yellow die and the 1st purple die in the current dice pool
  - `/reroll input:fortune show DiceColor/DicePosition` : shows adjacent sides for the specified die
      ie `/reroll input:fortune show Y1 P2`  (shows the adjacent side for the 1st yellow and 2 purple dicefaces)
  -  `/reroll input:fortune swap DiceColor/DicePosition AdjacentFace` (From `/reroll input:fortune show` Command): swaps the current face for an adjacent one
      ie `/reroll input:fortune swap 2Y 3`: swaps the current die face on the 2nd yellow with option 3 of the adjacent sides
- `/help input:` Type `/help input:topic` for further information
  - topics: `roll`, `destiny`, `crit`, `shipcrit`, `character`, `initiative`, `duty`, `obligation`, `poly`

## L5R commands

- `/roll input:` : rolls any combination of L5R dice
- `/poly input:` : rolls any combination of polyhedral dice
- `/keep input:` : ie `/keep input:12` - keeps the first, second, and discards the rest of the dice
- `/add input:` : ie `/add input:ww` - adds specified dice to previous dicepool.
- `/reroll input:` : ie `/reroll input:12` - rerolls the first and second dice without modifying the rest of the dicepool
- `/help input:` : displays help for topics  

## General Commands

- `/invite` : get an invite link for @D1-C3
- `/stats` : Displays # of servers/users bot is currently has.

## Patrons
- Caleb Smith
- Chad Owen
- Clynac
- Esteban Riviera
- Flobio
- Gil Colgate
- Jason Greathouse
- Joonas Moisio
- JP Sugarbroad
- Matt Langhinrichs
- Matthew R Martinez
- Michael C Hershiser
- Mitch Christenson
- Nathan Montondon
- Ohdias
- Peter Cummuskey
- Peter Por
- Scott McNeil
- Tommy R.
- triplel
- Xavi Santamaria

[Patreon](https://www.patreon.com/SkyJedi)

[Fantasy Flight Games, Genesys](https://www.fantasyflightgames.com/en/products/genesys)
