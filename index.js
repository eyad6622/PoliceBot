import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  Events
} from 'discord.js';
import { google } from 'googleapis';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SPREADSHEET_ID = '14b6MbVuWiwczTOqd2pnPk1W6lJ3WtYTurmFlnumQarA';
const SHEET_NAME = ' LSPD';
const KEYFILEPATH = './discordbotservice-462507-8b3cd7b7b787.json';

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

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

client.once('ready', () => {
  console.log(`✅ البوت شغال: ${client.user.tag}`);
});

async function updateNameAndGetCode(name, rank) {
  rank = rank.trim();
  const startRow = rankStartRows[rank];
  const numRowsToCheck = 6;

  if (!startRow) throw new Error(`الرتبة "${rank}" غير موجودة.`);

  const cleanedInputName = name.trim().toLowerCase();

  // ✅ حذف الاسم من جميع الرتب
  for (const [otherRank, rowStart] of Object.entries(rankStartRows)) {
    const range = `${SHEET_NAME}!A${rowStart}:B${rowStart + numRowsToCheck - 1}`;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
    const rows = res.data.values || [];

    for (let i = 0; i < numRowsToCheck; i++) {
      const row = rows[i] || [];
      const existingName = row[1];

      if (existingName && existingName.trim().toLowerCase() === cleanedInputName) {
        const clearRange = `${SHEET_NAME}!B${rowStart + i}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: clearRange,
          valueInputOption: 'RAW',
          resource: { values: [['']] },
        });
        console.log(`🗑️ حذف الاسم ${name} من رتبة ${otherRank}`);
        break;
      }
    }
  }

  // ✅ تسجيل الاسم في الرتبة الجديدة
  const targetRange = `${SHEET_NAME}!A${startRow}:B${startRow + numRowsToCheck - 1}`;
  const targetRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: targetRange,
  });

  const targetRows = targetRes.data.values || [];

  for (let i = 0; i < numRowsToCheck; i++) {
    const row = targetRows[i] || [];
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

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.content.startsWith('!HR')) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('rank_select')
      .setPlaceholder('اختر رتبتك')
      .addOptions(
        Object.keys(rankStartRows).map(rank => ({
          label: rank,
          value: rank
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await message.reply({
      content: '🎖️ اختر رتبتك من القائمة:',
      components: [row]
    });
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== 'rank_select') return;

  const selectedRank = interaction.values[0];
  await interaction.reply({
    content: '✍️ اكتب اسمك اسم شخصيتك العسكرية:',
    ephemeral: true
  });

  const filter = m => m.author.id === interaction.user.id;
  const channel = await interaction.channel;

  channel.awaitMessages({ filter, max: 1, time: 60_000, errors: ['time'] })
    .then(async collected => {
      const name = collected.first().content;

      try {
        const code = await updateNameAndGetCode(name, selectedRank);
        await channel.send(`✅ تم تسجيلك يا ${name}\n🎖️ الرتبة: ${selectedRank}\n📛 كودك: \`${code}\``);
      } catch (err) {
        console.error(err);
        await channel.send(`❌ خطأ: ${err.message}`);
      }
    })
    .catch(() => {
      channel.send('⌛ انتهى الوقت، اكتب !تسجيل مرة ثانية');
    });
});

client.login(DISCORD_TOKEN);
