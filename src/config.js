const config = {
  mongodb: {
    uri: 'mongodb://pmt1506:inEiUEzZNEXcOB9q@ac-lwlclos-shard-00-00.ladph0b.mongodb.net:27017,ac-lwlclos-shard-00-01.ladph0b.mongodb.net:27017,ac-lwlclos-shard-00-02.ladph0b.mongodb.net:27017/?ssl=true&replicaSet=atlas-84ahc7-shard-0&authSource=admin&appName=qltk',
    dbName: 'qltk',
    collections: {
      keys: 'keys',
      accounts: 'accounts',
    },
  },
  app: {
    title: 'TienTool - Gunny2017',
    version: '1.0.0',
  },
};

export default config;
