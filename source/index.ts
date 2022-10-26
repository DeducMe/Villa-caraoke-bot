import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
// replace the value below with the Telegram token you receive from @BotFather
const token = '5682656312:AAF8iYL-ndx5VRisoQLdPBiassDd5ROzR84';
const admins = [309012249, 719854908];

type IGlobalData = {
    userData: {
        userId: number;
        curPage: number;
        bufMusicData: string[];
        userName?: string;
    }[];
};

const globalData: IGlobalData = {
    userData: []
};
// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

const textes: string[] = [];
const MUSIC_PAGING = 10;
const ARTISTS_PAGING = 10;

async function normalizeText() {
    let text = await fs.readFileSync('../assets/text.txt', 'utf8');
    if (!text.includes('#EXTINF')) return;
    text = text
        .replaceAll('#EXTM3U', '')
        .replaceAll('.mpg', '')
        .replaceAll('ё', 'е')
        .replaceAll('.wmv', '')
        .replaceAll('�', '')
        .replaceAll('.mp4', '')
        .replaceAll('.mp3', '')
        .replaceAll('.sfk', '')
        .replaceAll('.scc', '')
        .replaceAll('.avi', '')
        .replaceAll(' - ', '~')
        .replaceAll('ПОПОЙКА', '')
        .replaceAll('ПОПОЙК', '')
        .replaceAll('А\\', '')
        .replaceAll('\\', '')
        .split(`\r\n`)
        .filter((item) => !item.includes('#EXTINF'))
        .map((item) => {
            const splitted = item.split('~');
            if (splitted.length < 2) return item;
            if (/[А-ЯЁ][а-яё]/i.test(item)) {
                splitted[2] = 'наше 🐻';
            } else {
                splitted[2] = 'иностранное 👽';
            }

            return splitted.join('~');
        })
        .join('\n');
    textes.push(text);

    return await fs.writeFileSync('../assets/textParsed.txt', textes.join('\n'));
}

async function getTxtToJson() {
    let text = await fs.readFileSync('../assets/textParsed.txt', 'utf8');

    const jsonData = text
        .split('\n')
        .map((item, index) => {
            const data: string[] = item.split('~');
            let singleName = false;
            if (data.length === 1) singleName = true;
            return {
                view: {
                    id: index,
                    artist: singleName ? '' : data[0],
                    name: singleName ? data[0] : data[1] || '',
                    type: data[2] || ''
                },
                sys: {
                    id: index,
                    artist: singleName ? '' : data[0]?.toLowerCase().replace(/\s/g, ''),
                    name: data[singleName ? 0 : 1]?.toLowerCase().replace(/\s/g, '') || '',
                    type: data[2]?.toLowerCase().replace(/\s/g, '') || ''
                }
            };
        })
        .filter((item) => !!item.view.name.trim());
    await fs.writeFileSync('../assets/jsonData.json', JSON.stringify(jsonData));
    return jsonData;
}

async function switchMusicPage(msg: any, page: number) {
    let findUserIndex = globalData.userData.findIndex((item) => item.userId === msg.chat.id);
    const bufMusicData = globalData.userData[findUserIndex].bufMusicData;
    console.log(bufMusicData[0], page);

    const curPage = globalData.userData[findUserIndex].curPage;
    const parsedJsonString = bufMusicData
        .slice(page * MUSIC_PAGING, (page + 1) * MUSIC_PAGING)
        .join('\n')
        .trim();

    // send back the matched "whatever" to the chat
    const opts = {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        reply_markup: {
            inline_keyboard: [
                [
                    { text: `<< (${curPage})`, callback_data: 'prevPage' },
                    { text: `>> (${Math.floor(bufMusicData.length / MUSIC_PAGING) - curPage})`, callback_data: 'nextPage' }
                ]
            ]
        }
    };

    bot.editMessageText(parsedJsonString || 'Не найдено ни одного трека', opts);

    // bot.sendMessage(chatId, parsedJsonString || 'Не найдено ни одного трека', opts);
}

async function getMusicJson(msg: any, customMessage?: string) {
    let musicjson = await fs.readFileSync('../assets/jsonData.json', 'utf-8');
    const message = customMessage || msg.text;

    const respSearch = message.replace('/music', '').toLowerCase().replaceAll('ё', 'е')?.replace(/\s/g, '')?.trim();
    let filteredJson: any[] = JSON.parse(musicjson);
    if (respSearch)
        filteredJson = filteredJson
            .filter((item) => {
                if (item.sys.artist.includes(respSearch) || item.sys.name.includes(respSearch) || item.sys.type.includes(respSearch)) {
                    return true;
                }

                return false;
            })
            .filter((item) => !!item.view.name);
    return filteredJson;
}

async function getMusic(msg: any, customMessage?: string) {
    const filteredJson = await getMusicJson(msg, customMessage);

    const chatId = msg.chat.id;
    const loadingMessage = await bot.sendMessage(chatId, 'Ищем музыку по вашему запросу...');

    const parsedJson = filteredJson.map(
        (item) => `${item.view.name && `Трек: ${item.view.name}\n`}${item.view.artist && `Исполнитель: ${item.view.artist}\n`}${item.view.type && `Тип: ${item.view.type}\n`}`
    );

    let findUserIndex = globalData.userData.findIndex((item) => item.userId === msg.chat.id);
    globalData.userData[findUserIndex].curPage = 0;
    const bufMusicData = JSON.parse(JSON.stringify(parsedJson));
    globalData.userData[findUserIndex].bufMusicData = bufMusicData;

    const opts = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: `<< (${0})`, callback_data: 'prevPage' },
                    { text: `>> (${Math.floor(parsedJson.length / MUSIC_PAGING)})`, callback_data: 'nextPage' }
                ]
            ]
        }
    };
    const moreThanPaging = parsedJson.length > MUSIC_PAGING;
    if (moreThanPaging) {
        parsedJson.length = MUSIC_PAGING;
    }
    const parsedJsonString = parsedJson.join('\n').trim();
    // send back the matched "whatever" to the chat
    bot.deleteMessage(chatId, `${loadingMessage.message_id}`);
    bot.sendMessage(chatId, parsedJsonString || 'Не найдено ни одного трека', moreThanPaging ? opts : undefined);
}

async function checkUser(msg: any) {
    let findUser = globalData.userData.find((item) => item.userId === msg.chat.id);
    if (!findUser) {
        globalData.userData.push({ userId: msg.chat.id, curPage: 0, bufMusicData: [], userName: '@' + msg.chat.username + ' ' + msg.chat.first_name });
    }
}

bot.on('message', async (msg) => {
    if (!msg.text?.includes('/music') && (!msg.text || msg.text[0] === '/')) return;
    checkUser(msg);
    getMusic(msg);
});

bot.on('document', async (msg, match: any) => {
    if (!msg.from || !msg.document?.file_id || !admins.includes(msg.from.id)) return;
    bot.sendMessage(msg.chat.id, 'Грузим файл...');

    let timeout: any = null;

    const readableStream = await bot.getFileStream(msg.document?.file_id);

    readableStream.on('error', function (error) {
        bot.sendMessage(msg.chat.id, `error: ${error.message}`);
    });

    readableStream.on('data', async (chunk) => {
        await fs.writeFileSync('../assets/text.txt', chunk.toString());
        await normalizeText();

        console.log('wtf');
        timeout && clearTimeout(timeout);
        timeout = setTimeout(async () => {
            await getTxtToJson();

            bot.sendMessage(msg.chat.id, 'Файл песен успешно загружен');
        }, 1000);
    });
});

bot.on('callback_query', function onCallbackQuery(callbackQuery) {
    let action = callbackQuery.data;
    const msg = callbackQuery.message;

    checkUser(msg);
    if (!msg || !action) return;

    console.log(msg);

    let findUserIndex = globalData.userData.findIndex((item) => item.userId === msg.chat.id);

    const curPage = globalData.userData[findUserIndex].curPage;
    const bufMusicData = globalData.userData[findUserIndex].bufMusicData;

    const match = action.split('~');
    action = match[0];

    console.log(match);

    switch (action) {
        case 'music':
            globalData.userData[findUserIndex].curPage = 0;
            getMusic(msg, '/music');

            break;
        case 'musicRu':
            globalData.userData[findUserIndex].curPage = 0;
            getMusic(msg, 'наше');
            break;
        case 'musicEn':
            globalData.userData[findUserIndex].curPage = 0;
            getMusic(msg, 'иностранное');
            break;
        case 'nextPage':
            if (!globalData.userData[findUserIndex]) break;

            if ((curPage + 1) * MUSIC_PAGING <= bufMusicData.length) {
                globalData.userData[findUserIndex].curPage += 1;
                switchMusicPage(msg, globalData.userData[findUserIndex].curPage);
            }
            break;
        case 'prevPage':
            if (curPage - 1 >= 0) {
                globalData.userData[findUserIndex].curPage -= 1;
                switchMusicPage(msg, globalData.userData[findUserIndex].curPage);
            }
            break;
        case 'findMusic':
            getMusic(msg, match[1]);
            break;
        default:
            break;
    }

    // bot.editMessageText(text, opts);
});

bot.onText(/\/help|\/start/, async (msg: any, match: any) => {
    checkUser(msg);
    const opts = {
        parse_mode: 'HTML',

        reply_markup: {
            inline_keyboard: [
                [{ text: 'Посмотреть музыку', callback_data: 'music' }],
                [
                    { text: 'Наше 🐻', callback_data: 'musicRu' },
                    { text: 'Иностранное 👽', callback_data: 'musicEn' }
                ]
            ]
        }
    };

    bot.sendMessage(
        msg.chat.id,
        'Привет! Это бот караоке тусовок <b>Villa Stage</b>.\n\nВы можете отправить <b>/music</b> чтобы посмотреть список всех песен или <b>просто вписать любое слово для поиска по песне</b> и исполнителю\n\n<span class="tg-spoiler">Для просмотра всех исполнителей напишите /get_artists, но будьте осторожны, у нас их очень много и они все упадут к вам в чат. Лучше используйте обычный поиск :)</span>\n\nЕсли вы хотите спеть песню напишите "/todj ваще сообщение". Оно сразу отправится к нам в чат и мы вам напишем.',
        opts
    );
});

bot.onText(/\/todj/, async (msg, match: any) => {
    const { id, first_name, username, type } = msg.chat;
    const chatId = msg.chat.id;
    if (!first_name && !username) return;
    const respText = msg.text?.replace('/todj', '');

    if (!respText) {
        bot.sendMessage(chatId, `Напишите сообщение в виде /todj Хочу спеть Артура Пирожкова - Paradise`);
        return;
    }
    bot.sendMessage(-842704770, `${first_name}(@${username}) говорит:\n${respText}`);
    bot.sendMessage(chatId, `Ваше сообщение отправлено к нам в чат!`);
});

bot.onText(/\/get_users/, async (msg, match: any) => {
    const chatId = msg.chat.id;
    if (!admins.includes(chatId)) return;

    const parsedUsers = globalData.userData.map((item) => `${item.userName}`).join('\n');
    bot.sendMessage(chatId, parsedUsers);
});

bot.onText(/\/get_artists/, async (msg, match: any) => {
    const musicJson = await getMusicJson(msg, '/music');
    const chatId = msg.chat.id;

    const artists = musicJson.map((item) => item.view.artist.trim() || 'Нет исполнителя');
    let filteredArtists = artists.filter((item, index) => artists.indexOf(item) === index).sort();
    let messagesBlocks = [];
    for (let index = 0; index < Math.floor(filteredArtists.length / ARTISTS_PAGING); index++) {
        messagesBlocks.push(filteredArtists.slice(index * ARTISTS_PAGING, (index + 1) * ARTISTS_PAGING));
    }
    messagesBlocks
        .filter((item) => !!item)
        .forEach(async (msgBlock, index) => {
            setTimeout(() => {
                const opts = {
                    reply_markup: {
                        inline_keyboard: msgBlock.map((item) => [{ text: item, callback_data: 'findMusic~' + item }])
                    }
                };

                bot.sendMessage(chatId, 'Список исполнителей у нас', opts);
            }, index * 100);
        });
});
