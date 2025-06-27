const mongoose = require('mongoose');
const MONGO_URI = "mongodb+srv://dhruvvpatel1010:Dhruv%40ss37@users.mvjxxyr.mongodb.net/?retryWrites=true&w=majority&appName=Users";


async function connectDB() {
  if (mongoose.connection.readyState >= 1) return;
  await mongoose.connect(MONGO_URI);
}

module.exports = connectDB;