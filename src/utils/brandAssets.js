const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

const LOGO_NAME = 'eselmusic.png';
const BANNER_NAME = 'eselmusicbanner.png';

const LOGO_PATH = path.join(__dirname, '../../eselmusic.png');
const BANNER_PATH = path.join(__dirname, '../../eselmusicbanner.png');

function buildBrandPayload(embed, { includeBanner = false } = {}) {
    const files = [];
    const branded = { ...embed };

    if (fs.existsSync(LOGO_PATH)) {
        files.push(new AttachmentBuilder(LOGO_PATH, { name: LOGO_NAME }));

        if (!branded.thumbnail) {
            branded.thumbnail = { url: `attachment://${LOGO_NAME}` };
        }

        if (branded.footer) {
            branded.footer = { ...branded.footer, icon_url: `attachment://${LOGO_NAME}` };
        } else {
            branded.footer = { text: 'EselMusic', icon_url: `attachment://${LOGO_NAME}` };
        }
    }

    if (includeBanner && fs.existsSync(BANNER_PATH)) {
        files.push(new AttachmentBuilder(BANNER_PATH, { name: BANNER_NAME }));
        branded.image = { url: `attachment://${BANNER_NAME}` };
    }

    return files.length > 0 ? { embeds: [branded], files } : { embeds: [branded] };
}

module.exports = { buildBrandPayload };
