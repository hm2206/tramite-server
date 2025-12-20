const Env = use('Env');
const moment = require('moment');

const LINK = (disk, pathRelative) => `api/file/?disk=${disk}&path=${pathRelative}`;

const URL = (link, up = false) => `${Env.get('APP_URL')}/${link}${up ? `&update=${moment().valueOf()}` : ''}`;

/**
 * Generate a unique ID string
 * @param {number} length - Length of the ID (default: 10)
 * @returns {string}
 */
const uid = (length = 10) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

/**
 * Round number down to specified decimal places
 * @param {number} num - Number to round
 * @param {number} decimals - Decimal places
 * @returns {number}
 */
const roundTo = {
    down: (num, decimals) => Math.floor(num * Math.pow(10, decimals)) / Math.pow(10, decimals),
    up: (num, decimals) => Math.ceil(num * Math.pow(10, decimals)) / Math.pow(10, decimals),
    round: (num, decimals) => Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals)
};

module.exports = { LINK, URL, uid, roundTo };