// Enums for Data Collection
export enum Script {
  LATIN = 'latin',
  GEEZ = 'geez',
  ARABIC = 'arabic',
  AJAMI = 'ajami',
  TIFINAGH = 'tifinagh',
  NKO = 'nko',
  VAI = 'vai',
  OTHER = 'other',
}

export enum SourceType {
  COMMUNITY = 'community',
  WEB_PUBLIC = 'web_public',
  INTERVIEW = 'interview',
  MEDIA = 'media',
  OTHER = 'other',
}

export enum Domain {
  CULTURE_AND_RELIGION = 'culture_and_religion',
  EDUCATION = 'education',
  HEALTH = 'health',
  LIVELIHOODS_AND_WORK = 'livelihoods_and_work',
  GOVERNANCE_CIVIC = 'governance_civic',
  MEDIA_AND_ONLINE = 'media_and_online',
  HOUSEHOLD_AND_CARE = 'household_and_care',
}

export enum Theme {
  STEREOTYPES = 'stereotypes',
  HATE_OR_INSULT = 'hate_or_insult',
  MISINFORMATION = 'misinformation',
  PUBLIC_INTEREST = 'public_interest',
  SPECIALIZED_ADVICE = 'specialized_advice',
}

export enum SensitiveCharacteristic {
  AGE = 'age',
  DISABILITY = 'disability',
  ETHNICITY = 'ethnicity',
  GENDER = 'gender',
  HEALTH_STATUS = 'health_status',
  INCOME_LEVEL = 'income_level',
  NATIONALITY = 'nationality',
  RELIGION = 'religion',
  TRIBE = 'tribe',
  OTHER = 'other',
}

export enum SafetyFlag {
  SAFE = 'safe',
  SENSITIVE = 'sensitive',
  REJECT = 'reject',
}

// Enums for Annotation
export enum TargetGender {
  FEMALE = 'female',
  MALE = 'male',
  NEUTRAL = 'neutral',
  MIXED = 'mixed',
  NONBINARY = 'nonbinary',
  UNKNOWN = 'unknown',
}

export enum BiasLabel {
  STEREOTYPE = 'stereotype',
  COUNTER_STEREOTYPE = 'counter-stereotype',
  NEUTRAL = 'neutral',
  DEROGATION = 'derogation',
}

export enum Explicitness {
  EXPLICIT = 'explicit',
  IMPLICIT = 'implicit',
}

export enum StereotypeCategory {
  PROFESSION = 'profession',
  FAMILY_ROLE = 'family_role',
  LEADERSHIP = 'leadership',
  EDUCATION = 'education',
  RELIGION_CULTURE = 'religion_culture',
  PROVERB_IDIOM = 'proverb_idiom',
  DAILY_LIFE = 'daily_life',
  APPEARANCE = 'appearance',
  CAPABILITY = 'capability',
}

export enum SentimentTowardReferent {
  POSITIVE = 'positive',
  NEUTRAL = 'neutral',
  NEGATIVE = 'negative',
}

export enum Device {
  METAPHOR = 'metaphor',
  PROVERB = 'proverb',
  SARCASM = 'sarcasm',
  QUESTION = 'question',
  DIRECTIVE = 'directive',
  NARRATIVE = 'narrative',
}

export enum QAStatus {
  GOLD = 'gold',
  PASSED = 'passed',
  NEEDS_REVIEW = 'needs_review',
  REJECTED = 'rejected',
}

// Type definitions
export type DataCollection = {
  id: string;
  language: string;
  script: Script;
  country: string;
  region_dialect: string;
  source_type: SourceType;
  source_ref: string;
  collection_date: Date;
  text: string;
  domain: Domain;
  topic: string;
  theme: Theme;
  sensitive_characteristic?: SensitiveCharacteristic | null;
  safety_flag: SafetyFlag;
  pii_removed: boolean;
  collector_id?: string;
  notes?: string | null;
};

export type Annotation = {
  data_id: string;
  target_gender: TargetGender;
  bias_label: BiasLabel;
  explicitness: Explicitness;
  stereotype_category?: StereotypeCategory | null;
  sentiment_toward_referent?: SentimentTowardReferent | null;
  device?: Device | null;
  annotator_id: string;
  annotation_date?: Date;
  qa_status: QAStatus;
  notes?: string | null;
  annotation_time_seconds?: number;
};

export type AnnotatedData = DataCollection & {
  target_gender: TargetGender;
  bias_label: BiasLabel;
  explicitness: Explicitness;
  stereotype_category?: StereotypeCategory | null;
  sentiment_toward_referent?: SentimentTowardReferent | null;
  device?: Device | null;
  annotator_id: string;
  qa_status: QAStatus;
};
