// discord-bot.js
import { Client, GatewayIntentBits, Events, SlashCommandBuilder, REST, Routes, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { google } from 'googleapis';
import fs from 'fs';

const DISCORD_TOKEN = '';
const CLIENT_ID = '';
const GUILD_ID = '';
const SPREADSHEET_ID = '';
const SHEET_NAME = 'LSPD';
const KEYFILEPATH = './discordbotservice-462507-8b3cd7b7b787.json';
const PROMOTION_CHANNEL_ID = '1382085327044481074';

const rankStartRows = {
  "First Lieutenant": 20,
  "Lieutenant": 25,
  "Staff Sergeant": 29,
  "First Sergeant": 34,
  "Sergeant": 40,
  "Senior Officer": 47,
  "Officer III": 54,
  "Officer II": 61,
  "Officer I": 68,
  "Cadet": 75
};

const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILEPATH,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function updateNameAndGetCode(name, rank) {
  rank = rank.trim();
  const startRow = rankStartRows[rank];
  const numRowsToCheck = 6;

  if (!startRow) throw new Error(`الرتبة "${rank}" غير موجودة.`);

  const range = `${SHEET_NAME}!A${startRow}:B${startRow + numRowsToCheck - 1}`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  const rows = res.data.values || [];

  // حذف الاسم من جميع الرتب أولاً
  await removeNameFromAllRanks(name);

  for (let i = 0; i < numRowsToCheck; i++) {
    const row = rows[i] || [];
    const code = row[0];
    const existingName = row[1];

    if (!existingName || existingName === '') {
      const updateRange = `${SHEET_NAME}!B${startRow + i}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: updateRange,
        valueInputOption: 'RAW',
        resource: { values: [[name]] },
      });
      return code || `U-${startRow + i}`;
    }
  }

  throw new Error(`لا يوجد صف فارغ في الرتبة "${rank}".`);
}

async function removeNameFromAllRanks(name) {
  for (const rank in rankStartRows) {
    const startRow = rankStartRows[rank];
    const range = `${SHEET_NAME}!B${startRow}:B${startRow + 5}`;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
    const rows = res.data.values || [];

    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] && rows[i][0].trim() === name.trim()) {
        const updateRange = `${SHEET_NAME}!B${startRow + i}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: updateRange,
          valueInputOption: 'RAW',
          resource: { values: [['']] },
        });
      }
    }
  }
}

client.once('ready', () => console.log(`✅ البوت شغال: ${client.user.tag}`));

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const commandName = interaction.commandName;
  const member = interaction.options.getUser('user');
  const rankList = Object.keys(rankStartRows);

  const menu1 = new StringSelectMenuBuilder()
    .setCustomId('fromRank')
    .setPlaceholder('اختر الرتبة الحالية')
    .addOptions(rankList.map(rank => ({ label: rank, value: rank })));

  const menu2 = new StringSelectMenuBuilder()
    .setCustomId('toRank')
    .setPlaceholder('اختر الرتبة الجديدة')
    .addOptions(rankList.map(rank => ({ label: rank, value: rank })));

  const row1 = new ActionRowBuilder().addComponents(menu1);
  const row2 = new ActionRowBuilder().addComponents(menu2);

  await interaction.reply({
    content: `اختر الرتبة الحالية والجديدة لـ ${member.username}:`,
    components: [row1, row2],
    flags: 64 // ephemeral
  });

  const collector = interaction.channel.createMessageComponentCollector({ time: 60000 });
  const selections = {};

  collector.on('collect', async i => {
    if (i.user.id !== interaction.user.id) return i.reply({ content: '❌ هذا ليس لك.', ephemeral: true });
    selections[i.customId] = i.values[0];
    await i.deferUpdate();

    if (selections.fromRank && selections.toRank) {
      try {
        const code = await updateNameAndGetCode(member.username, selections.toRank);
        const promoChannel = interaction.guild.channels.cache.get(PROMOTION_CHANNEL_ID);

        const messageText =
          commandName === 'ترقية'
            ? `**بسم الله الرحمن الرحيم**\n\nأما بعد\n\nقرار ترقية للعسكري :\n${member}\nمن رتبة "${selections.fromRank}" إلى رتبة "${selections.toRank}"\n\nنبارك لك إنجازك ونتمنى لك دوام التوفيق والسداد\n\nBy : رئيس الشرطة\n\nوالله ولي التوفيق`
            : `**بسم الله الرحمن الرحيم**\n\nأما بعد\n\nتم تنتيل رتبة ${member}\nمن رتبة "${selections.fromRank}" إلى رتبة "${selections.toRank}"\n\nBy : رئيس الشرطة\n\nوالله ولي التوفيق`;

        await promoChannel.send(messageText);
        await interaction.followUp({ content: '✅ تم تحديث الرتبة بنجاح.', flags: 64 });
        collector.stop();
      } catch (error) {
        console.error('❌ خطأ:', error);
        await interaction.followUp({ content: 'حدث خطأ أثناء تنفيذ العملية.', flags: 64 });
      }
    }
  });
});

const commands = [
  new SlashCommandBuilder()
    .setName('ترقية')
    .setDescription('ترقية عضو')
    .addUserOption(option => option.setName('user').setDescription('اختر العضو').setRequired(true)),

  new SlashCommandBuilder()
    .setName('تنتيل')
    .setDescription('خفض رتبة عضو')
    .addUserOption(option => option.setName('user').setDescription('اختر العضو').setRequired(true)),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log('⏳ جاري تسجيل الأوامر...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ تم تسجيل الأوامر.');
  } catch (error) {
    console.error('❌ خطأ في التسجيل:', error);
  }
})();

client.login(DISCORD_TOKEN);
