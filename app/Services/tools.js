const Env = use('Env');


const getClient = (request = {}) => {
    return {
        ClientId: request.header('ClientId') || request.input('ClientId', ''),
        ClientSecret : request.header('ClientSecret') || request.input('ClientSecret', '')
    }
}

const getAuthorization = (request = {}) => {
    let auth = request.header('Authorization') || request.input('Authorization', '');
    return {
        Authorization: auth
    }
}


const getSystemKey = () => Env.get('SYSTEM_KEY') || "";


const API = {
    API_AUTHENTICATION: Env.get('API_AUTHENTICATION') || "",
    API_SIGNATURE: Env.get('API_SIGNATURE') || "",
}

// exportart 
module.exports = { 
    getClient,
    getAuthorization,
    getSystemKey,
    API,
};