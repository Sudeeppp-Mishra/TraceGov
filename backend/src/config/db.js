import mongoose from 'mongoose';

/**
 * Connects to the MongoDB server.
 */
export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tracegov';

  try {
    mongoose.connection.on('connected', () => {
      console.log('MongoDB: Connected successfully');
    });

    mongoose.connection.on('error', (err) => {
      console.error(`MongoDB: Connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB: Disconnected');
    });

    // Pin reads to the primary replica so analytics queries always see
    // the freshest data. Atlas replica sets can lag noticeably when the
    // driver load-balances across secondaries, which makes the dashboard
    // charts look stale right after a fresh seed.
    await mongoose.connect(uri, {
      readPreference: 'primary',
      readPreferenceTags: [{ nodeType: 'primary' }],
    });
  } catch (err) {
    console.error(`MongoDB: Initial connection failed: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Disconnects from the MongoDB server.
 */
export async function disconnectDatabase() {
  try {
    await mongoose.disconnect();
    console.log('MongoDB: Disconnected successfully');
  } catch (err) {
    console.error(`MongoDB: Disconnection error: ${err.message}`);
  }
}