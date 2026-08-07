import { DocumentCategory } from '../models/DocumentCategory.js';

// Default initial categories grounded in Nagarik Bada Patra standards
const INITIAL_CATEGORIES = [
  {
    name: 'Land Valuation Claim',
    typicalDays: '5-10',
    deskCount: 'multi',
    trackingValue: 'high',
    requiredChecklist: ['Citizenship Copy', 'Land Ownership Title Deed (Lalpurja)', 'Previous Tax Invoice Receipt', 'Ward Recommendation Letter'],
  },
  {
    name: 'House/Building Map Approval',
    typicalDays: '10-20',
    deskCount: 'multi',
    trackingValue: 'high',
    requiredChecklist: ['Citizenship Copy', 'Land Ownership Title Deed (Lalpurja)', 'Building Design/Map Drawing', 'Engineer Certification'],
  },
  {
    name: 'Citizenship Verification Request',
    typicalDays: '3-7',
    deskCount: 'multi',
    trackingValue: 'high',
    requiredChecklist: ['Birth Certificate', "Parents' Citizenship Copy", 'Ward Recommendation Letter'],
  },
  {
    name: 'Business License Approval',
    typicalDays: '5-15',
    deskCount: 'multi',
    trackingValue: 'high',
    requiredChecklist: ['Citizenship Copy of Proprietor', 'Business Registration Form', 'Rent Agreement / Land Deed', 'Tax Office Clearance'],
  },
  {
    name: 'Recommendation Letter',
    typicalDays: '0-1',
    deskCount: 'single',
    trackingValue: 'low',
    requiredChecklist: ['Citizenship Copy', 'Application Letter (Nivedan)', 'Previous Tax Receipt'],
  },
  {
    name: 'Tax Clearance Receipt',
    typicalDays: '0-1',
    deskCount: 'single',
    trackingValue: 'low',
    requiredChecklist: ['Citizenship Copy', 'Land/Property Ownership Copy', 'Previous Year Tax Receipt'],
  },
];

/**
 * Get all Nagarik Bada Patra Document Categories.
 * Auto-seeds initial defaults if the database collection is empty.
 */
export async function getCategories(req, res, next) {
  try {
    let categories = await DocumentCategory.find({}).sort({ name: 1 }).lean();

    if (categories.length === 0) {
      categories = await DocumentCategory.insertMany(INITIAL_CATEGORIES);
    }

    return res.json({
      success: true,
      categories,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create a new Nagarik Bada Patra Document Category (Admin only).
 */
export async function createCategory(req, res, next) {
  try {
    const { name, typicalDays, deskCount, trackingValue, requiredChecklist } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const existing = await DocumentCategory.findOne({ name: name.trim() });
    if (existing) {
      return res.status(409).json({ error: 'A document category with this name already exists' });
    }

    const checklist = Array.isArray(requiredChecklist)
      ? requiredChecklist.map((c) => String(c).trim()).filter(Boolean)
      : String(requiredChecklist || '').split(',').map((c) => c.trim()).filter(Boolean);

    const category = await DocumentCategory.create({
      name: name.trim(),
      typicalDays: typicalDays || '3-7',
      deskCount: deskCount || 'multi',
      trackingValue: trackingValue || 'medium',
      requiredChecklist: checklist,
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      category,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update an existing Nagarik Bada Patra Document Category (Admin only).
 */
export async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    const { name, typicalDays, deskCount, trackingValue, requiredChecklist, isActive } = req.body;

    const category = await DocumentCategory.findById(id);
    if (!category) {
      return res.status(404).json({ error: 'Document category not found' });
    }

    if (name && name.trim()) {
      const existing = await DocumentCategory.findOne({ name: name.trim(), _id: { $ne: id } });
      if (existing) {
        return res.status(409).json({ error: 'Another category with this name already exists' });
      }
      category.name = name.trim();
    }

    if (typicalDays !== undefined) category.typicalDays = typicalDays;
    if (deskCount !== undefined) category.deskCount = deskCount;
    if (trackingValue !== undefined) category.trackingValue = trackingValue;
    if (isActive !== undefined) category.isActive = isActive;

    if (requiredChecklist !== undefined) {
      const checklist = Array.isArray(requiredChecklist)
        ? requiredChecklist.map((c) => String(c).trim()).filter(Boolean)
        : String(requiredChecklist || '').split(',').map((c) => c.trim()).filter(Boolean);
      category.requiredChecklist = checklist;
    }

    await category.save();

    return res.json({
      success: true,
      category,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete a Nagarik Bada Patra Document Category (Admin only).
 */
export async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    const category = await DocumentCategory.findByIdAndDelete(id);

    if (!category) {
      return res.status(404).json({ error: 'Document category not found' });
    }

    return res.json({
      success: true,
      message: `Category "${category.name}" removed successfully.`,
    });
  } catch (err) {
    next(err);
  }
}
