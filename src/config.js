import dotenv from 'dotenv';

dotenv.config();

const config = {
  mongodb: {
    uri: process.env.MONGODB_URI || "mongodb://pmt1506:2eiSrgulkIDlJnPt@ac-lwlclos-shard-00-00.ladph0b.mongodb.net:27017,ac-lwlclos-shard-00-01.ladph0b.mongodb.net:27017,ac-lwlclos-shard-00-02.ladph0b.mongodb.net:27017/?ssl=true&replicaSet=atlas-84ahc7-shard-0&authSource=admin&appName=qltk",
    dbName: 'qltk',
    collections: {
      keys: 'keys',
      licenseRequests: 'licenseRequests',
      accounts: 'accounts',
      templates: 'templates',
    },
  },
  app: {
    title: 'TienTool - Gunny2017',
    version: '1.0.0',
  },
};

export default config;
