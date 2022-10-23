import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';

// replace the value below with the Telegram token you receive from @BotFather
const token = '5682656312:AAF8iYL-ndx5VRisoQLdPBiassDd5ROzR84';
const admins = [309012249, 719854908];
// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

async function getTxtToJson() {
    let text = await fs.readFileSync('../assets/text.txt', 'utf8');

    const jsonData = text.split('\n').map((item, index) => {
        const data: string[] = item.split(',');
        return {
            view: {
                id: index,
                artist: data[0],
                name: data[1],
                type: data[2]
            },
            sys: {
                id: index,
                artist: data[0].toLowerCase().replace(/\s/g, ''),
                name: data[1].toLowerCase().replace(/\s/g, ''),
                type: data[2].toLowerCase().replace(/\s/g, '')
            }
        };
    });
    await fs.writeFileSync('../assets/jsonData.json', JSON.stringify(jsonData));
    return jsonData;
}

async function getMusic(msg: any, match?: any) {
    let musicjson = await fs.readFileSync('../assets/jsonData.json', 'utf-8');

    // 'msg' is the received Message from Telegram
    // 'match' is the result of executing the regexp above on the text content
    // of the message

    const chatId = msg.chat.id;
    const respSearch = msg.text.replace('/music', '').toLowerCase().replace(/\s/g, ''); // the captured "whatever"
    let filteredJson: any[] = JSON.parse(musicjson);

    if (respSearch)
        filteredJson = filteredJson.filter((item) => {
            if (item.sys.artist.includes(respSearch) || item.sys.name.includes(respSearch) || item.sys.type.includes(respSearch)) {
                return true;
            }

            return false;
        });

    const parsedJson = filteredJson.map((item) => `Трек: ${item.view.name}\nИсполнитель: ${item.view.artist}\nТип: ${item.view.type}`).join('\n\n');
    // send back the matched "whatever" to the chat
    bot.sendMessage(chatId, parsedJson || 'Не найдено ни одного трека');
}

bot.onText(/\/music/, async (msg, match: any) => {
    getMusic(msg, match);
});

bot.on('document', async (msg, match: any) => {
    if (!msg.from || !msg.document?.file_id || !admins.includes(msg.from.id)) return;
    bot.sendMessage(msg.chat.id, 'Грузим файл...');

    const readableStream = await bot.getFileStream(msg.document?.file_id);

    readableStream.on('error', function (error) {
        bot.sendMessage(msg.chat.id, `error: ${error.message}`);
    });

    readableStream.on('data', async (chunk) => {
        await fs.writeFileSync('../assets/text.txt', chunk.toString());
        await getTxtToJson();
        bot.sendMessage(msg.chat.id, 'Файл песен успешно загружен');
    });
});

bot.on('callback_query', function onCallbackQuery(callbackQuery) {
    console.log(callbackQuery);
    const action = callbackQuery.data;
    const msg = callbackQuery.message;
    if (!msg) return;

    const opts = {
        chat_id: msg.chat.id,
        message_id: msg.message_id
    };

    if (action === 'music') {
        getMusic(msg);
    }

    // bot.editMessageText(text, opts);
});

bot.onText(/\/help/, async (msg: any, match: any) => {
    const opts = {
        reply_markup: {
            inline_keyboard: [[{ text: 'Посмотреть музыку', callback_data: 'music' }]]
        }
    };

    bot.sendMessage(
        msg.chat.id,
        'Привет! Это бот караоке тусовок Villa Stage.\n\nВы можете отправить "/music" чтобы посмотреть список всех песен или "/music фильтр" для поиска по вашему запросу\n\nЕсли у вас возникли вопросы напиште "/to_admin ваще сообщение". Оно сразу отправится к нам в чат и мы вам напишем.',
        opts
    );
});

bot.onText(/\/to_admin (.+)/, async (msg, match: any) => {
    const { id, first_name, username, type } = msg.chat;
    const chatId = msg.chat.id;
    if (!first_name && !username) return;
    const respText = match[1];

    if (!respText) return;
    bot.sendMessage(-842704770, `${first_name}(@${username}) говорит:\n${respText}`);
    bot.sendMessage(chatId, `Ваше сообщение отправлено к нам в чат!`);
});
