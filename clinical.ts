export type ClinicalRole = 'doctor' | 'nurse' | 'pharmacist' | 'auditor' | 'patient';

export interface UserSession {
  id: string;
  name: string;
  title: string;
  role: ClinicalRole;
  licenseNumber: string;
  department: string;
}

export interface VitalSign {
  id: string;
  timestamp: string;
  heartRate: number; // bpm
  bloodPressureSystolic: number; // mmHg
  bloodPressureDiastolic: number; // mmHg
  respiratoryRate: number; // breaths/min
  oxygenSaturation: number; // %
  temperature: number; // Celsius
  painScale: number; // 0-10
  newsScore?: number; // National Early Warning Score
}

export interface LabValue {
  id: string;
  testName: string;
  category: 'CBC' | 'CMP' | 'Cardiology' | 'ABG' | 'Urinalysis' | 'Endocrine' | 'Infectious';
  value: number | string;
  unit: string;
  referenceRange: string;
  flag: 'normal' | 'low' | 'high' | 'critical';
  collectedAt: string;
}

export interface Allergy {
  id: string;
  allergen: string;
  type: 'drug' | 'food' | 'environmental';
  reaction: string;
  severity: 'mild' | 'moderate' | 'severe' | 'anaphylaxis';
  diagnosedDate?: string;
}

export interface ActiveMedication {
  id: string;
  name: string;
  genericName: string;
  dosage: string;
  frequency: string;
  route: string;
  startDate: string;
  prescribedBy: string;
  status: 'active' | 'pending' | 'discontinued';
  indication: string;
}

export interface Patient {
  id: string;
  mrn: string; // Medical Record Number
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  bloodType: string;
  admissionDate: string;
  roomNumber: string;
  attendingPhysician: string;
  primaryDiagnosis: string;
  codeStatus: 'Full Code' | 'DNR' | 'DNI' | 'Comfort Care';
  allergies: Allergy[];
  vitalsHistory: VitalSign[];
  labHistory: LabValue[];
  activeMedications: ActiveMedication[];
  clinicalNotesRaw: string;
  pastMedicalHistory: string[];
  surgicalHistory: string[];
}

export interface SOAPNote {
  id: string;
  patientId: string;
  generatedAt: string;
  signedBy?: string;
  signedAt?: string;
  status: 'draft' | 'reviewed' | 'finalized';
  subjective: {
    chiefComplaint: string;
    historyOfPresentIllness: string;
    reviewOfSystems: string[];
    symptomOnsetTimeline: { time: string; event: string }[];
  };
  objective: {
    vitalsSummary: string;
    physicalExam: {
      general: string;
      cardiovascular: string;
      respiratory: string;
      abdomen: string;
      neurological: string;
      extremities: string;
    };
    diagnosticLabHighlights: string[];
  };
  assessment: {
    primaryDiagnosis: string;
    icd10Code: string;
    clinicalTrajectory: 'improving' | 'stable' | 'deteriorating' | 'critical';
    comorbidities: { diagnosis: string; icd10: string }[];
    clinicalRationale: string;
  };
  plan: {
    diagnostics: string[];
    medications: {
      action: 'start' | 'continue' | 'modify' | 'discontinue';
      drug: string;
      dosage: string;
      rationale: string;
    }[];
    nursingOrders: string[];
    patientEducation: string;
    followUpDisposition: string;
  };
}

export interface DrugInteractionAlert {
  id: string;
  severity: 'contraindicated' | 'severe' | 'moderate' | 'mild' | 'allergy_clash';
  primaryDrug: string;
  secondaryDrug?: string;
  allergen?: string;
  headline: string;
  mechanism: string;
  clinicalImpact: string;
  recommendedAction: string;
  alternativeOptions: string[];
  referenceEvidence: string;
  overridden?: boolean;
  overrideReason?: string;
  overriddenBy?: string;
  overrideTimestamp?: string;
}

export interface GuidelineCitation {
  id: string;
  guidelineName: string;
  issuingBody: string; // e.g. ACC/AHA, ADA, KDIGO, Surviving Sepsis
  year: number;
  recommendationClass: 'Class I' | 'Class IIa' | 'Class IIb' | 'Class III' | 'Best Practice';
  evidenceLevel: 'Level A' | 'Level B-R' | 'Level B-NR' | 'Level C-LD' | 'Level C-EO';
  section: string;
  excerpt: string;
  clinicalAction: string;
  url?: string;
}

export interface DifferentialDiagnosisItem {
  id: string;
  diagnosis: string;
  icd10: string;
  likelihoodScore: number; // 0 - 100
  supportiveEvidence: string[];
  refutingFactors: string[];
  recommendedWorkup: string[];
  riskTier: 'emergent' | 'high' | 'moderate' | 'low';
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: ClinicalRole;
  action: 'VIEW_RECORD' | 'GENERATE_SOAP' | 'EDIT_SOAP' | 'SIGN_SOAP' | 'OVERRIDE_DRUG_ALERT' | 'RUN_RAG_QUERY' | 'EXPORT_FHIR' | 'TOGGLE_PHI_MASK';
  patientId: string;
  patientName: string;
  justification: string;
  metadata?: Record<string, any>;
}
