import { Department } from '../models/Department.js';
import { File } from '../models/File.js';
import { User } from '../models/User.js';

/**
 * Retrieve all departments.
 * - Admins get both active and inactive departments.
 * - Officers get only active departments.
 */
export async function getDepartments(req, res, next) {
  try {
    const wardCode = req.user?.wardCode || 'W01';
    const filter = { wardCode };
    
    // Only admins can see inactive/disabled departments for configuration
    if (req.user?.role !== 'admin') {
      filter.isActive = true;
    }

    const departments = await Department.find(filter).sort({ name: 1 }).lean();
    return res.json({ success: true, departments });
  } catch (err) {
    next(err);
  }
}

/**
 * Create a new department (Admin only).
 */
export async function createDepartment(req, res, next) {
  try {
    const { name, code, description } = req.body;
    const wardCode = req.user.wardCode || 'W01';

    if (!name || !code) {
      return res.status(400).json({ success: false, error: 'Department name and code are required' });
    }

    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();

    // Check uniqueness within the ward
    const existing = await Department.findOne({
      $or: [{ name: cleanName }, { code: cleanCode }],
      wardCode,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'A department with this name or code already exists in your ward',
      });
    }

    const department = await Department.create({
      name: cleanName,
      code: cleanCode,
      description: description?.trim() || '',
      wardCode,
      isActive: true,
    });

    return res.status(201).json({ success: true, department });
  } catch (err) {
    next(err);
  }
}

/**
 * Update department metadata (Admin only).
 */
export async function updateDepartment(req, res, next) {
  try {
    const { id } = req.params;
    const { name, description, isActive } = req.body;
    const wardCode = req.user.wardCode;

    const department = await Department.findOne({ _id: id, wardCode });
    if (!department) {
      return res.status(404).json({ success: false, error: 'Department not found' });
    }

    if (name && name.trim() !== department.name) {
      const cleanName = name.trim();
      const existing = await Department.findOne({ name: cleanName, wardCode, _id: { $ne: id } });
      if (existing) {
        return res.status(400).json({ success: false, error: 'Another department already uses this name' });
      }
      department.name = cleanName;
    }

    if (description !== undefined) {
      department.description = description.trim();
    }

    if (isActive !== undefined) {
      department.isActive = Boolean(isActive);
    }

    await department.save();

    return res.json({ success: true, department });
  } catch (err) {
    next(err);
  }
}

/**
 * Permanently delete a department (Admin only).
 * Guarded: refuses when open files are currently at this desk or officers are
 * still assigned to it, so ledger locations always resolve to a known desk.
 */
export async function deleteDepartment(req, res, next) {
  try {
    const { id } = req.params;
    const wardCode = req.user.wardCode;

    const department = await Department.findOne({ _id: id, wardCode });
    if (!department) {
      return res.status(404).json({ success: false, error: 'Department not found' });
    }

    const [openFiles, assignedOfficers] = await Promise.all([
      File.countDocuments({ wardCode, currentLocation: department.name, isClosed: false }),
      User.countDocuments({ wardCode, deskLocation: department.name, isActive: true }),
    ]);

    if (openFiles > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete: ${openFiles} open file(s) are currently at this desk. Forward them first.`,
      });
    }
    if (assignedOfficers > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete: ${assignedOfficers} officer(s) are assigned to this desk. Reassign them first.`,
      });
    }

    await Department.deleteOne({ _id: id, wardCode });

    return res.json({ success: true, message: 'Department deleted' });
  } catch (err) {
    next(err);
  }
}
