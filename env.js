const path = require('path');

// Secrets come from .env (compose's env_file, or this file when run by hand), never config.json.
try {
    process.loadEnvFile(path.join(__dirname, '.env'));
} catch(err) {
    // The variables may come from the environment instead; `required` names any that are missing.
    if(err.code !== 'ENOENT' && err.code !== 'EISDIR') throw err;
}

// Returns the variable's value, or stops the start naming it (never its value).
const required = (name) => {
    const value = process.env[name];
    if(!value) {
        console.error(`Missing ${ name }: set it in .env.`);
        process.exit(1);
    }
    return value;
};

module.exports = { required };
