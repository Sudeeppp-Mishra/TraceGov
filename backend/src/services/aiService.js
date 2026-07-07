const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

/**
 * Utility helper to make requests to the AI microservice with timeout safety.
 */
async function callAiService(path, body, timeoutMs = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${AI_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    
    clearTimeout(id);
    if (!res.ok) {
      throw new Error(`AI service returned status ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(id);
    console.warn(`AI Service Error (calling ${path}): ${err.message}. Using local fallback.`);
    throw err; // Let caller catch and handle fallback
  }
}

/**
 * Analyze document OCR checking for required keywords and categorizing file content.
 */
export async function aiAnalyzeDocument({ imageBase64, requiredKeywords, detectedText }) {
  try {
    return await callAiService('/analyze-document', { imageBase64, requiredKeywords, detectedText });
  } catch {
    return {
      documentType: 'Unknown',
      classificationConfidence: 0.0,
      foundKeywords: [],
      missingKeywords: requiredKeywords || [],
      highlightedMissingItems: (requiredKeywords || []).map((kw) => ({
        keyword: kw,
        message: `${kw} check bypassed due to OCR offline.`,
      })),
      completenessScore: 0.0,
      isComplete: false,
      ocrConfidence: 0.0,
      extractedTextPreview: '(OCR Service Unavailable)',
    };
  }
}

/**
 * Uses M/M/1 queue model data to estimate file completion time in minutes.
 */
export async function aiEstimateCompletion({ movementData, avgServiceRateMu, avgArrivalRateLambda, remainingSteps }) {
  try {
    return await callAiService('/estimate-completion', {
      movementData,
      avgServiceRateMu,
      avgArrivalRateLambda,
      remainingSteps,
    });
  } catch {
    // Local Fallback: 35 minutes per remaining step
    const fallbackMins = Math.max(10, remainingSteps * 35);
    return {
      estimatedMinutesRemaining: fallbackMins,
      estimatedHoursRemaining: Number((fallbackMins / 60).toFixed(2)),
      model: 'Fallback (Heuristic)',
      confidence: 'low',
      parameters: { remainingSteps },
      bottleneckHint: 'AI estimation offline — displaying desk-time averages.',
    };
  }
}

/**
 * Predicts the probability of delays based on checklist items, backtracks, and queues.
 */
export async function aiPredictDelay({
  currentStatus,
  currentLocation,
  requiredDocuments,
  submittedDocuments,
  movementData,
  departmentQueueLength,
}) {
  try {
    return await callAiService('/predict-delay', {
      currentStatus,
      currentLocation,
      requiredDocuments,
      submittedDocuments,
      movementData,
      departmentQueueLength,
    });
  } catch {
    const missingCount = (requiredDocuments || []).length - (submittedDocuments || []).length;
    const backtrackCount = (movementData || []).filter((m) => m.action?.toLowerCase() === 'backtracked').length;
    
    // Heuristic delay prediction
    let prob = 15;
    prob += missingCount * 15;
    prob += backtrackCount * 25;
    prob += Math.min(20, (departmentQueueLength || 0) * 3);

    return {
      completionDate: new Date(Date.now() + 86400000 * 2).toISOString(), // 2 days from now
      delayProbability: Math.min(95, prob),
      expectedProcessingHours: Math.max(3, 4 + missingCount * 2 + backtrackCount * 6),
      departmentDelay: currentLocation || 'Unknown',
      confidenceScore: 'low',
      features: {
        missingDocumentCount: missingCount,
        backtrackCount,
        departmentQueueLength,
        fileAgeHours: 0,
      },
    };
  }
}

/**
 * Smart suggest returned location and reasons for backtracking a file.
 */
export async function aiSmartBacktrack({
  documentType,
  currentLocation,
  requiredDocuments,
  submittedDocuments,
  backtrackReason,
  movementData,
}) {
  try {
    return await callAiService('/smart-backtrack', {
      documentType,
      currentLocation,
      requiredDocuments,
      submittedDocuments,
      backtrackReason,
      movementData,
    });
  } catch {
    const missing = (requiredDocuments || []).filter((doc) => !(submittedDocuments || []).includes(doc));
    return {
      possibleReason: backtrackReason || (missing.length ? `Missing required: ${missing.join(', ')}` : 'Document revision needed'),
      missingDocuments: missing,
      requiredCorrections: missing.map((doc) => `Re-verify and attach ${doc}`),
      historicalSimilarCases: 0,
      recommendedDepartment: 'Reception',
      recommendation: 'Return to Reception for citizen details correction.',
      confidence: 'low',
    };
  }
}

/**
 * Generate human-friendly message describing status explanations to citizens.
 */
export async function aiCitizenMessage({
  currentStatus,
  currentLocation,
  requiredDocuments,
  submittedDocuments,
  movementData,
  departmentQueueLength,
}) {
  try {
    return await callAiService('/citizen-message', {
      currentStatus,
      currentLocation,
      requiredDocuments,
      submittedDocuments,
      movementData,
      departmentQueueLength,
    });
  } catch {
    const location = currentLocation || 'the assigned section';
    let message = `Your file is currently under review in ${location}.`;
    if (currentStatus?.toLowerCase() === 'backtracked') {
      message = 'Your file requires revision or corrections before it can proceed.';
    }

    return {
      message,
      estimatedCompletion: 'Processing normal desk schedule.',
      missingDocuments: (requiredDocuments || []).filter((doc) => !(submittedDocuments || []).includes(doc)),
    };
  }
}
