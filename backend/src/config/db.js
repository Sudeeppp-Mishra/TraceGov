import mongoose from 'mongoose';

/**
 * Connects to the MongoDB server.
 */
export async function connectDatabase() {
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

    await mongoose.connect(uri);
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