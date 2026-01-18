import express from 'express';
import { getTypes, createType, deleteType, updateType } from '../controllers/type.controller.js';

const router = express.Router();

router.get('/', getTypes);
router.post('/', createType);
router.put('/:id', updateType);
router.delete('/:id', deleteType);

export default router;
