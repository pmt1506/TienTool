import dotenv from 'dotenv';

dotenv.config();

const config = {
  mongodb: {
    uri: process.env.MONGODB_URI,
    dbName: 'qltk',
    collections: {
      keys: 'keys',
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
