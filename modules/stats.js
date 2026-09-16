const Discord = require('discord.js');
const { Colors } = Discord;

const stats = async ({ interaction, client }) => {
    //required lazily to avoid a load-order-dependent circular require with ../index
    //(see modules/functions.js for the full explanation)
    const main = require('../index');
    const guilds = await client.shard.fetchClientValues('guilds.cache.size');
    const members = await client.shard.broadcastEval(c => c.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0));

    const totalGuilds = guilds.reduce((acc, guildCount) => acc + guildCount, 0);
    const totalMembers = members.reduce((acc, memberCount) => acc + memberCount, 0);
    const embed = new Discord.EmbedBuilder()
        .setTitle(`${client.user.username} Stats`)
        .setColor(Colors.White)
        .setDescription(`${client.shard.count} shard${client.shard.count > 1 ? 's' : ''}.\nServer count: ${totalGuilds}\nMember count: ${totalMembers}`);
    await main.sendMessage({ interaction, embed });
};

module.exports = stats;
