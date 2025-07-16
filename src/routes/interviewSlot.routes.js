const {optionalAuth, authMiddleware} = require("../middlewares/auth");
const express = require("express");
const interviewSlotController = require("../controllers/interviewSlot.controller");
const router = express.Router();


router.post('/', authMiddleware, interviewSlotController.createInterviewSlot );

router.get('/', authMiddleware, interviewSlotController.getInterviewSlots );

router.delete('/', authMiddleware, interviewSlotController.deleteInterviewSlot);

module.exports = router;
