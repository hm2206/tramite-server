const method = require('./method.json');
const Route = use('Route');

const getRoute = (method_name, name, isProtected = true) => {
    let r = Route[method_name](method[name].url, name);
    if (isProtected) r.middleware([`allow:${method[name].name}`]);
    return r;
}

module.exports = getRoute; 