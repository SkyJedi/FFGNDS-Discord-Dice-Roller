const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { required } = require('./env');
const config = require('./config.json')

initializeApp({
    credential: cert({
        projectId: required('FIREBASE_PROJECT_ID'),
        clientEmail: required('FIREBASE_CLIENT_EMAIL'),
        // .env keeps the key's newlines as the two characters \n
        privateKey: required('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n')
    }),
    databaseURL: config.databaseURL
});

const db = getFirestore();

exports.db = db;
