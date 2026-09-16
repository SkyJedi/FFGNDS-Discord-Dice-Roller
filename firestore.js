const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./d1-firestore.json');
const config = require('./config.json')

initializeApp({
    credential: cert(serviceAccount),
    databaseURL: config.databaseURL
});

const db = getFirestore();

exports.db = db;
