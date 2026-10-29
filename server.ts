import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import { CLINICAL_GUIDELINES_CORPUS, searchClinicalGuidelines } from './src/data/guidelinesCorpus';
import { runRuleEngine } from './src/data/drugRules';
import { AuditLogEntry, SOAPNote, DifferentialDiagnosisItem } from './src/types/clinical';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// In-memory HIPAA audit log store
const auditLogs: AuditLogEntry[] = [
  {
    id: 'audit-init-01',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    actorId: 'doc-mercer-01',
    actorName: 'Dr. Alex Mercer, MD',
    actorRole: 'doctor',
    action: 'VIEW_RECORD',
    patientId: 'pat-001',
    patientName: 'Animesh Mishra',
    justification: 'Inpatient Cardiology Morning Bedside Rounds',
    metadata: { unit: 'Cardiology 402-B', device: 'Hospital Workstation WS-04' }
  },
  {
    id: 'audit-init-02',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    actorId: 'doc-mercer-01',
    actorName: 'Dr. Alex Mercer, MD',
    actorRole: 'doctor',
    action: 'GENERATE_SOAP',
    patientId: 'pat-001',
    patientName: 'Animesh Mishra',
    justification: 'Automated clinical documentation & ICD-10 extraction',
    metadata: { model: 'gemini-3.8-flash' }
  }
];

// Initialize GoogleGenAI server-side
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// 2. Audit logs API
app.get('/api/clinical/audit-logs', (req, res) => {
  res.json({ logs: auditLogs });
});

app.post('/api/clinical/audit-logs', (req, res) => {
  const newLog: AuditLogEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    actorId: req.body.actorId || 'anon-actor',
    actorName: req.body.actorName || 'Clinical Staff',
    actorRole: req.body.actorRole || 'doctor',
    action: req.body.action || 'VIEW_RECORD',
    patientId: req.body.patientId || 'unknown',
    patientName: req.body.patientName || 'Anonymous',
    justification: req.body.justification || 'Clinical Care Delivery',
    metadata: req.body.metadata || {}
  };

  auditLogs.unshift(newLog);
  // Keep last 250 logs
  if (auditLogs.length > 250) auditLogs.pop();

  res.json({ success: true, log: newLog });
});

// 3. Automated SOAP Note Generator
app.post('/api/clinical/generate-soap', async (req, res) => {
  const {
    patient,
    clinicalNotesRaw,
    vitals,
    labs,
    activeMedications,
    allergies
  } = req.body;

  const prompt = `You are MedFlow AI, an expert board-certified clinical documentation and decision support engine.
Given the following patient data, unstructured clinical transcript/notes, vitals, labs, active medications, and allergies, generate an exhaustive, professional, standardized SOAP Note (Subjective, Objective, Assessment, Plan).

PATIENT DEMOGRAPHICS:
Name: ${patient?.firstName} ${patient?.lastName}
Age: ${patient?.age}, Gender: ${patient?.gender}, MRN: ${patient?.mrn}
Primary Diagnosis: ${patient?.primaryDiagnosis}

ALLERGIES:
${allergies?.map((a: any) => `- ${a.allergen} (${a.reaction}, Severity: ${a.severity})`).join('\n') || 'NKDA (No known drug allergies)'}

ACTIVE MEDICATIONS:
${activeMedications?.map((m: any) => `- ${m.name} (${m.dosage}, ${m.frequency}, ${m.route}) - Indication: ${m.indication}`).join('\n') || 'None'}

RECENT VITALS:
${vitals?.slice(0, 3).map((v: any) => `- ${v.timestamp}: BP ${v.bloodPressureSystolic}/${v.bloodPressureDiastolic} mmHg, HR ${v.heartRate} bpm, RR ${v.respiratoryRate}, SpO2 ${v.oxygenSaturation}%, Temp ${v.temperature}°C`).join('\n') || 'None recorded'}

SIGNIFICANT LABS:
${labs?.map((l: any) => `- ${l.testName}: ${l.value} ${l.unit} [Ref: ${l.referenceRange}] Flag: ${l.flag}`).join('\n') || 'None recorded'}

UNSTRUCTURED CLINICAL NOTES / DICTATION:
${clinicalNotesRaw || 'No dictation provided'}

OUTPUT INSTRUCTIONS:
Return a strictly formatted JSON object adhering to this schema:
{
  "subjective": {
    "chiefComplaint": "string",
    "historyOfPresentIllness": "comprehensive narrative paragraph detailing timeline, character, exacerbating/relieving factors",
    "reviewOfSystems": ["string array of positive and negative findings by organ system"],
    "symptomOnsetTimeline": [{"time": "string e.g. 4 days ago", "event": "string"}]
  },
  "objective": {
    "vitalsSummary": "string concise synthesis of hemodynamic stability and abnormal vitals",
    "physicalExam": {
      "general": "string",
      "cardiovascular": "string",
      "respiratory": "string",
      "abdomen": "string",
      "neurological": "string",
      "extremities": "string"
    },
    "diagnosticLabHighlights": ["string array highlighting abnormal or critical findings with clinical context"]
  },
  "assessment": {
    "primaryDiagnosis": "string",
    "icd10Code": "string ICD-10-CM code",
    "clinicalTrajectory": "improving" | "stable" | "deteriorating" | "critical",
    "comorbidities": [{"diagnosis": "string", "icd10": "string"}],
    "clinicalRationale": "concise medical reasoning explaining pathophysiology and current status"
  },
  "plan": {
    "diagnostics": ["diagnostic orders needed e.g. Repeat labs, imaging, telemetry"],
    "medications": [
      {"action": "start" | "continue" | "modify" | "discontinue", "drug": "string", "dosage": "string", "rationale": "string"}
    ],
    "nursingOrders": ["nursing monitoring parameters e.g. strict I&O, daily weights, fall precautions"],
    "patientEducation": "key counseling points for patient/family",
    "followUpDisposition": "admission unit, consults requested, or discharge timeframe"
  }
}
Do not wrap in markdown quotes if possible, output pure JSON.`;

  try {
    if (ai) {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const responseText = response.text?.trim() || '';
      try {
        const parsed = JSON.parse(responseText);
        const generatedSOAP: SOAPNote = {
          id: `soap-${Date.now()}`,
          patientId: patient?.id || 'pat-unknown',
          generatedAt: new Date().toISOString(),
          status: 'draft',
          ...parsed
        };
        return res.json({ soap: generatedSOAP, engine: 'gemini-3.8-flash' });
      } catch (parseErr) {
        console.warn('Failed to parse Gemini JSON output, applying clinical structured fallback', parseErr);
      }
    }
  } catch (err) {
    console.error('Gemini API SOAP call failed:', err);
  }

  // Fallback clinical extractor (deterministic & structured)
  const isHeartFailure = (clinicalNotesRaw + (patient?.primaryDiagnosis || '')).toLowerCase().includes('heart failure') || (clinicalNotesRaw + '').includes('HFrEF');
  const isDKA = (clinicalNotesRaw + (patient?.primaryDiagnosis || '')).toLowerCase().includes('dka') || (clinicalNotesRaw + '').includes('ketoacidosis');

  const fallbackSOAP: SOAPNote = {
    id: `soap-fb-${Date.now()}`,
    patientId: patient?.id || 'pat-unknown',
    generatedAt: new Date().toISOString(),
    status: 'draft',
    subjective: {
      chiefComplaint: isHeartFailure
        ? 'Progressive shortness of breath, orthopnea, and 9 lb weight gain'
        : isDKA
        ? 'Severe abdominal pain, nausea/vomiting, and Kussmaul respirations'
        : 'Acute clinical evaluation and management review',
      historyOfPresentIllness: `${patient?.firstName} ${patient?.lastName} presents with acute symptom progression. Clinical notes indicate ${clinicalNotesRaw.slice(0, 300)}...`,
      reviewOfSystems: [
        'Constitutional: Fatigue present; fever noted in septic presentations',
        'Cardiovascular: Palpitations, dependent edema, and orthopnea evaluated',
        'Respiratory: Dyspnea upon minimal exertion, cough reported',
        'Gastrointestinal: Nausea and abdominal pain reviewed'
      ],
      symptomOnsetTimeline: [
        { time: '4 days ago', event: 'Initial symptom onset with mild activity limitation' },
        { time: '24-48 hours ago', event: 'Marked escalation requiring emergency medical evaluation' },
        { time: 'Today', event: 'Inpatient triage, lab drawing, and medication review' }
      ]
    },
    objective: {
      vitalsSummary: vitals?.[0]
        ? `BP ${vitals[0].bloodPressureSystolic}/${vitals[0].bloodPressureDiastolic} mmHg, HR ${vitals[0].heartRate} bpm, SpO2 ${vitals[0].oxygenSaturation}% on admission.`
        : 'Hemodynamics monitored continuously.',
      physicalExam: {
        general: 'Ill-appearing, awake, interactive but in moderate acute distress.',
        cardiovascular: isHeartFailure ? 'Tachycardic, S3 gallop audible, elevated jugular venous pressure.' : 'Tachycardic, regular rhythm, no murmurs.',
        respiratory: 'Bilateral lung base findings noted; tachypneic.',
        abdomen: isDKA ? 'Diffuse abdominal tenderness without rebound or guarding.' : 'Soft, non-distended, normoactive bowel sounds.',
        neurological: 'Alert and oriented to person, place, and situation; cranial nerves grossly intact.',
        extremities: isHeartFailure ? '+3 bilateral pitting lower extremity edema.' : 'Warm, peripheral pulses palpable, skin turgor reduced.'
      },
      diagnosticLabHighlights: labs?.filter((l: any) => l.flag === 'critical' || l.flag === 'high').map((l: any) => `${l.testName}: ${l.value} ${l.unit} (${l.flag.toUpperCase()})`) || ['Lab review underway']
    },
    assessment: {
      primaryDiagnosis: patient?.primaryDiagnosis || 'Acute Clinical Episode',
      icd10Code: isHeartFailure ? 'I50.23 (Acute on chronic systolic heart failure)' : isDKA ? 'E10.10 (Type 1 diabetes with ketoacidosis without coma)' : 'R69 (Illness, unspecified)',
      clinicalTrajectory: 'critical',
      comorbidities: (patient?.pastMedicalHistory || []).map((pmh: string, idx: number) => ({
        diagnosis: pmh,
        icd10: `Z87.${idx + 1}`
      })),
      clinicalRationale: 'Decompensation triggered by acute physiologic stress, underlying renal/cardiovascular interplay, and medication interactions. Immediate multidisciplinary stabilization indicated.'
    },
    plan: {
      diagnostics: [
        'Serial basic metabolic panels (BMP) every 4 hours',
        'Continuous telemetry and pulse oximetry monitoring',
        'Repeat 12-lead electrocardiogram (ECG)'
      ],
      medications: (patient?.activeMedications || []).map((m: any) => ({
        action: m.name.toLowerCase().includes('bactrim') || m.name.toLowerCase().includes('ampicillin') ? 'discontinue' : 'continue',
        drug: m.name,
        dosage: m.dosage,
        rationale: m.name.toLowerCase().includes('bactrim') ? 'Discontinue due to severe hyperkalemia interaction' : m.name.toLowerCase().includes('ampicillin') ? 'Discontinue due to documented penicillin anaphylaxis' : 'Continue baseline therapy with clinical monitoring'
      })),
      nursingOrders: [
        'Strict Intake and Output (I&O) recording every shift',
        'Daily morning weights prior to breakfast',
        'Notify physician if systolic BP <90 or >170, or HR >110'
      ],
      patientEducation: 'Discussed disease pathophysiology, dietary restrictions (low sodium/carbohydrate management), and allergy flags with patient.',
      followUpDisposition: 'Inpatient monitored telemetry stepdown unit; cardiology and endocrinology co-management.'
    }
  };

  res.json({ soap: fallbackSOAP, engine: 'rule-based-fallback' });
});

// 4. Drug-Drug & Drug-Allergy Interaction Checker
app.post('/api/clinical/drug-interaction-check', async (req, res) => {
  const { medications, allergies, patientAge, clinicalConditions } = req.body;

  // Run deterministic safety rule engine first
  const baseAlerts = runRuleEngine(medications || [], allergies || []);

  // If Gemini is available, supplement with deep clinical pharmacological analysis
  if (ai && medications?.length > 1) {
    try {
      const prompt = `You are a clinical pharmacologist and hospital safety auditor.
Review the following active medications, known allergies, patient age (${patientAge || 60}), and clinical conditions:
Medications: ${medications.map((m: any) => `${m.name} (${m.dosage}, ${m.frequency})`).join(', ')}
Allergies: ${allergies?.map((a: any) => `${a.allergen} (${a.reaction})`).join(', ') || 'None'}
Conditions: ${clinicalConditions?.join(', ') || 'None specified'}

Analyze:
1. Critical drug-drug interactions (CYP450 metabolism, QT prolongation, hyperkalemia, nephrotoxicity, bleeding).
2. Drug-allergy cross-reactivity (beta-lactams, sulfonamides, NSAIDs).
3. Beers criteria appropriateness if age >= 65.

Return a JSON array of interaction alerts (only if significant moderate, severe, or contraindicated risks exist).
Format:
[
  {
    "severity": "contraindicated" | "severe" | "moderate" | "allergy_clash",
    "primaryDrug": "string",
    "secondaryDrug": "string",
    "headline": "string",
    "mechanism": "detailed pharmacological mechanism",
    "clinicalImpact": "patient symptoms and dangers",
    "recommendedAction": "clinical intervention",
    "alternativeOptions": ["drug alternative 1", "drug alternative 2"],
    "referenceEvidence": "citation e.g. FDA / ACC / Beers Criteria"
  }
]`;

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const parsedAI = JSON.parse(aiResponse.text?.trim() || '[]');
      if (Array.isArray(parsedAI) && parsedAI.length > 0) {
        // Merge without duplicating
        const merged = [...baseAlerts];
        for (const item of parsedAI) {
          const exists = merged.some(
            b => b.primaryDrug.toLowerCase().includes(item.primaryDrug?.toLowerCase() || '') &&
                 (b.secondaryDrug?.toLowerCase().includes(item.secondaryDrug?.toLowerCase() || '') ||
                  b.allergen?.toLowerCase().includes(item.secondaryDrug?.toLowerCase() || ''))
          );
          if (!exists) {
            merged.push({
              id: `alert-ai-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              ...item,
              overridden: false
            });
          }
        }
        return res.json({ alerts: merged, engine: 'gemini-pharmacology' });
      }
    } catch (err) {
      console.error('Gemini interaction check error:', err);
    }
  }

  res.json({ alerts: baseAlerts, engine: 'clinical-rule-engine' });
});

// 5. Evidence-Based RAG Search
app.post('/api/clinical/rag-search', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });

  // 1. Vector/keyword search across clinical guideline corpus
  const retrievedCitations = searchClinicalGuidelines(query, 5);

  // 2. Synthesize clinician recommendation with Gemini if available
  let synthesis = '';
  if (ai) {
    try {
      const prompt = `You are a clinical librarian and evidence-based medicine specialist.
CLINICAL QUESTION: "${query}"

RETRIEVED GUIDELINE EVIDENCE EXCERPTS:
${retrievedCitations.map(c => `[${c.issuingBody} ${c.year} - ${c.section}]
Recommendation: ${c.recommendationClass}, Evidence: ${c.evidenceLevel}
Excerpt: ${c.excerpt}
Clinical Action: ${c.clinicalAction}`).join('\n\n')}

Provide an executive, concise synthesis for an attending physician:
1. Executive Clinical Bottom Line (1-2 sentences).
2. Key Recommendations with formal ACC/AHA or ADA recommendation grade (e.g., Class I Level A).
3. Specific Monitoring & Thresholds (potassium levels, creatinine, blood glucose, MAP targets).
4. Red Flags / Absolute Contraindications.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt
      });

      synthesis = response.text || '';
    } catch (err) {
      console.error('Gemini RAG synthesis error:', err);
    }
  }

  if (!synthesis) {
    synthesis = `Based on retrieved clinical guidelines from ${retrievedCitations.map(c => c.issuingBody).join(', ')}:
• Primary Guideline Direction: ${retrievedCitations[0]?.clinicalAction || 'Follow standardized institutional protocols.'}
• Evidence Grading: ${retrievedCitations[0]?.recommendationClass || 'Class I'} (${retrievedCitations[0]?.evidenceLevel || 'Level A'}).
• Key Safety Caution: Monitor renal function and serum electrolytes closely prior to therapy initiation.`;
  }

  res.json({
    query,
    synthesis,
    citations: retrievedCitations
  });
});

// 6. Differential Diagnosis Engine
app.post('/api/clinical/differential-dx', async (req, res) => {
  const { patient, vitals, labs, notes } = req.body;

  if (ai) {
    try {
      const prompt = `You are a diagnostic reasoning AI for hospital physicians.
Given this patient presentation:
Chief Complaint / Notes: ${notes || patient?.clinicalNotesRaw || patient?.primaryDiagnosis}
Vitals: ${JSON.stringify(vitals?.[0] || {})}
Significant Labs: ${labs?.filter((l: any) => l.flag !== 'normal').map((l: any) => `${l.testName}: ${l.value} (${l.flag})`).join(', ')}

Generate a ranked differential diagnosis list of 3-5 conditions in JSON format:
[
  {
    "id": "dx-1",
    "diagnosis": "string",
    "icd10": "string",
    "likelihoodScore": number (10-95),
    "riskTier": "emergent" | "high" | "moderate" | "low",
    "supportiveEvidence": ["finding 1", "finding 2"],
    "refutingFactors": ["absence of X", "contradicted by Y"],
    "recommendedWorkup": ["test 1", "imaging 2"]
  }
]`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const parsed: DifferentialDiagnosisItem[] = JSON.parse(response.text?.trim() || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        return res.json({ differentials: parsed, engine: 'gemini-3.8-flash' });
      }
    } catch (err) {
      console.error('Gemini DDx error:', err);
    }
  }

  // Clinical fallback
  const isHF = (notes + (patient?.primaryDiagnosis || '')).toLowerCase().includes('heart');
  const differentials: DifferentialDiagnosisItem[] = isHF ? [
    {
      id: 'dx-01',
      diagnosis: 'Acute Decompensated Heart Failure (HFrEF Exacerbation)',
      icd10: 'I50.23',
      likelihoodScore: 92,
      riskTier: 'high',
      supportiveEvidence: ['Markedly elevated NT-proBNP (3,840 pg/mL)', 'Orthopnea & paroxysmal nocturnal dyspnea', '+3 bilateral pitting pedal edema', 'Elevated JVP to 12 cm'],
      refutingFactors: ['Afebrile, lacks localized lobar consolidation on chest auscultation'],
      recommendedWorkup: ['Transthoracic Echocardiogram (TTE)', 'Serial BMP at 24 hours', 'Daily weights']
    },
    {
      id: 'dx-02',
      diagnosis: 'Cardiorenal Syndrome Type 1 (Acute)',
      icd10: 'N17.9',
      likelihoodScore: 78,
      riskTier: 'high',
      supportiveEvidence: ['Acute jump in creatinine to 2.3 mg/dL from baseline 1.6', 'eGFR dropped to 26 mL/min', 'Severe venous congestion'],
      refutingFactors: ['Urinary sediment negative for muddy brown casts'],
      recommendedWorkup: ['Renal ultrasound with resistive index', 'Fractional excretion of sodium (FeNa)', 'Urinalysis with microscopy']
    },
    {
      id: 'dx-03',
      diagnosis: 'Drug-Induced Severe Hyperkalemia',
      icd10: 'E87.5',
      likelihoodScore: 84,
      riskTier: 'emergent',
      supportiveEvidence: ['Serum K+ 5.4 mEq/L', 'Concurrent Lisinopril + Spironolactone + Trimethoprim triple therapy', 'Reduced renal clearance'],
      refutingFactors: ['No peaked T-waves or QRS widening on initial rhythm strip yet'],
      recommendedWorkup: ['STAT 12-lead ECG', 'Serum potassium re-check in 2 hours', 'Review of dietary potassium']
    }
  ] : [
    {
      id: 'dx-04',
      diagnosis: 'Diabetic Ketoacidosis (Severe)',
      icd10: 'E10.10',
      likelihoodScore: 96,
      riskTier: 'emergent',
      supportiveEvidence: ['Blood glucose 486 mg/dL', 'High anion gap metabolic acidosis (AG 26, pH 7.18, HCO3 9)', 'Serum Beta-hydroxybutyrate 6.4 mmol/L', 'Kussmaul breathing'],
      refutingFactors: ['Serum osmolality <320 mOsm/kg (rules out isolated HHS)'],
      recommendedWorkup: ['Hourly capillary blood glucose', 'BMP every 2 hours', 'Serial venous blood gas']
    },
    {
      id: 'dx-05',
      diagnosis: 'Community-Acquired Pneumonia with Secondary Sepsis',
      icd10: 'J18.9',
      likelihoodScore: 85,
      riskTier: 'high',
      supportiveEvidence: ['Fever 38.9°C, HR 124 bpm, RR 30', 'Leukocytosis (WBC 19.8)', 'Right lower lobe bronchial breath sounds & rust-colored sputum'],
      refutingFactors: ['Requires chest X-ray confirmation of focal infiltrate'],
      recommendedWorkup: ['Portable Chest Radiograph (CXR)', 'Blood cultures x2 STAT', 'Sputum Gram stain and culture']
    }
  ];

  res.json({ differentials, engine: 'clinical-rule-fallback' });
});

// Setup Vite in development or serve static in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`MedFlow AI Full-Stack Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
