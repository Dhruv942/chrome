const express = require('express');
const router = express.Router();
const connectDB = require('../utils/mongo');
const User = require('../models/User');

router.get('/', async (req, res) => {
  await connectDB();
  const userId = req.cookies.user_id;
  if (!userId) return res.status(401).json({ message: 'Not logged in' });

  const user = await User.findById(userId);
  if (!user) return res.status(401).json({ message: 'User not found' });

  res.status(200).json({ loggedIn: true, name: user.name, email: user.email });
});

module.exports = router;