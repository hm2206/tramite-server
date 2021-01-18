
const getResponseError = (response, error, code = 'ERR_SYSTEM') => {
    let payload = {
        success: false,
        status: error.status || 501,
        code: error.code || code,
    }
    // parsear message
    try {
        let { errors, message } = JSON.parse(error.message);
        payload.message = message;
        payload.errors = errors;
    } catch (err) {
        payload.message = error.message;
    }
    // response
    return response.status(payload.status).send(payload);
}


module.exports = {
    getResponseError,
}