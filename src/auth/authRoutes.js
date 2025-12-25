const express = require('express');
const router = express.Router();
const path = require('path');
const authController = require('./authController');
const { isGuest } = require('./authMiddleware');

// Serve Pages
router.get('/login', isGuest, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/login.html'));
});

router.get('/register', isGuest, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/register.html'));
});

router.get('/forgot-password', isGuest, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/forgot-password.html'));
});

// API Endpoints
router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/logout', authController.logout);
router.get('/me', authController.getMe);
router.put('/profile', authController.updateProfile);

module.exports = router;
