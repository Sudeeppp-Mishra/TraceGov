import { Router } from 'express';
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from '../controllers/departmentController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Secure all routes under authentication
router.use(authenticate);

// Everyone authenticated (officers and admins) can retrieve departments
router.get('/', getDepartments);

// Only admins can make changes
router.post('/', authorize('admin'), createDepartment);
router.put('/:id', authorize('admin'), updateDepartment);
router.delete('/:id', authorize('admin'), deleteDepartment);

export default router;
