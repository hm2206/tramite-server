const Env = use('Env');
const moment = require('moment');

const LINK = (disk, pathRelative) => `api/file/?disk=${disk}&path=${pathRelative}`;

const URL = (link, up = false) => `${Env.get('APP_URL')}/${link}${up ? `&update=${moment().valueOf()}` : ''}`;


module.exports = { LINK, URL };