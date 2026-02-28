import React, { useState } from 'react';
import '../styles/PatientInputForm.css';

interface PatientData {
  patientId: string;
  age: number;
  gender: string;
  Durationofdiabetes: number;
  BMI: number;
  Hypertension: number;
  OHA: number;
  INSULIN: number;
  HBA: number;
  CHO: number;
  TRI: number;
  HB: number;
  DR_Label: number;
}

interface PatientInputFormProps {
  onSubmit: (data: PatientData) => void;
}

const PatientInputForm: React.FC<PatientInputFormProps> = ({ onSubmit }) => {
  const [formData, setFormData] = useState<Record<keyof PatientData, any>>({
    patientId: '',
    age: '',
    gender: '',
    Durationofdiabetes: '',
    BMI: '',
    Hypertension: '',
    OHA: '',
    INSULIN: '',
    HBA: '',
    CHO: '',
    TRI: '',
    HB: '',
    DR_Label: '',
  });

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (
    field: keyof PatientData,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value === '' ? '' : (field === 'patientId' || field === 'gender' ? value : Number(value)),
    }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
    setIsSubmitted(false);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.patientId || !String(formData.patientId).trim()) {
      newErrors.patientId = 'Required';
    }
    if (formData.age === '' || formData.age < 0 || formData.age > 120) {
      newErrors.age = 'Invalid';
    }
    if (formData.BMI === '' || formData.BMI < 10 || formData.BMI > 60) {
      newErrors.BMI = 'Invalid';
    }

    const requiredFields: (keyof PatientData)[] = ['gender', 'Hypertension', 'OHA', 'INSULIN', 'DR_Label', 'Durationofdiabetes', 'HBA', 'CHO', 'TRI', 'HB'];
    requiredFields.forEach(field => {
      if (formData[field] === '') {
        newErrors[field] = 'Required';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (validateForm()) {
      onSubmit(formData as PatientData);
      setIsSubmitted(true);
    }
  };

  return (
    <form className="patient-input-form" onSubmit={handleSubmit}>
      <div className={`form-grid ${isSubmitted ? 'submitted' : ''}`}>
        {/* 1. Patient ID */}
        <div className="form-group">
          <label htmlFor="patientId">ID</label>
          <input
            id="patientId"
            type="text"
            value={formData.patientId}
            onChange={(e) => handleInputChange('patientId', e.target.value)}
            placeholder="ID"
            className={errors.patientId ? 'error' : ''}
          />
          {errors.patientId && (
            <span className="error-text">{errors.patientId}</span>
          )}
        </div>

        {/* 2. Age */}
        <div className="form-group">
          <label htmlFor="age">Age</label>
          <input
            id="age"
            type="number"
            min="0"
            max="120"
            value={formData.age}
            onChange={(e) => handleInputChange('age', e.target.value)}
            className={errors.age ? 'error' : ''}
            placeholder="Age"
          />
          {errors.age && <span className="error-text">{errors.age}</span>}
        </div>

        {/* 3. Gender */}
        <div className="form-group">
          <label htmlFor="gender">Gender</label>
          <select
            id="gender"
            value={formData.gender}
            onChange={(e) => handleInputChange('gender', e.target.value)}
            className={errors.gender ? 'error' : ''}
          >
            <option value="" disabled>Select</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
          {errors.gender && <span className="error-text">{errors.gender}</span>}
        </div>

        {/* 4. Duration of Diabetes */}
        <div className="form-group">
          <label htmlFor="duration">Duration of diabetes</label>
          <input
            id="duration"
            type="number"
            value={formData.Durationofdiabetes}
            onChange={(e) =>
              handleInputChange('Durationofdiabetes', e.target.value)
            }
            className={errors.Durationofdiabetes ? 'error' : ''}
            placeholder="Years"
          />
          {errors.Durationofdiabetes && <span className="error-text">{errors.Durationofdiabetes}</span>}
        </div>

        {/* 5. BMI */}
        <div className="form-group">
          <label htmlFor="bmi">BMI</label>
          <input
            id="bmi"
            type="number"
            step="0.1"
            value={formData.BMI}
            onChange={(e) => handleInputChange('BMI', e.target.value)}
            className={errors.BMI ? 'error' : ''}
            placeholder="BMI"
          />
          {errors.BMI && <span className="error-text">{errors.BMI}</span>}
        </div>

        {/* 6. Hypertension */}
        <div className="form-group">
          <label htmlFor="hypertension">Hypertension</label>
          <select
            id="hypertension"
            value={formData.Hypertension}
            onChange={(e) => handleInputChange('Hypertension', e.target.value)}
            className={errors.Hypertension ? 'error' : ''}
          >
            <option value="" disabled>Select</option>
            <option value="0">No</option>
            <option value="1">Yes</option>
          </select>
          {errors.Hypertension && <span className="error-text">{errors.Hypertension}</span>}
        </div>

        {/* 7. OHA */}
        <div className="form-group">
          <label htmlFor="oha">OHA</label>
          <select
            id="oha"
            value={formData.OHA}
            onChange={(e) => handleInputChange('OHA', e.target.value)}
            className={errors.OHA ? 'error' : ''}
          >
            <option value="" disabled>Select</option>
            <option value="0">No</option>
            <option value="1">Yes</option>
          </select>
          {errors.OHA && <span className="error-text">{errors.OHA}</span>}
        </div>

        {/* 8. INSULIN */}
        <div className="form-group">
          <label htmlFor="insulin">INSULIN</label>
          <select
            id="insulin"
            value={formData.INSULIN}
            onChange={(e) => handleInputChange('INSULIN', e.target.value)}
            className={errors.INSULIN ? 'error' : ''}
          >
            <option value="" disabled>Select</option>
            <option value="0">No</option>
            <option value="1">Yes</option>
          </select>
          {errors.INSULIN && <span className="error-text">{errors.INSULIN}</span>}
        </div>

        {/* 9. HBA */}
        <div className="form-group">
          <label htmlFor="hba">HBA</label>
          <input
            id="hba"
            type="number"
            step="0.1"
            value={formData.HBA}
            onChange={(e) => handleInputChange('HBA', e.target.value)}
            className={errors.HBA ? 'error' : ''}
            placeholder="HBA"
          />
          {errors.HBA && <span className="error-text">{errors.HBA}</span>}
        </div>

        {/* 10. CHO */}
        <div className="form-group">
          <label htmlFor="cho">CHO</label>
          <input
            id="cho"
            type="number"
            value={formData.CHO}
            onChange={(e) => handleInputChange('CHO', e.target.value)}
            className={errors.CHO ? 'error' : ''}
            placeholder="CHO"
          />
          {errors.CHO && <span className="error-text">{errors.CHO}</span>}
        </div>

        {/* 11. TRI */}
        <div className="form-group">
          <label htmlFor="tri">TRI</label>
          <input
            id="tri"
            type="number"
            value={formData.TRI}
            onChange={(e) => handleInputChange('TRI', e.target.value)}
            className={errors.TRI ? 'error' : ''}
            placeholder="TRI"
          />
          {errors.TRI && <span className="error-text">{errors.TRI}</span>}
        </div>

        {/* 12. HB */}
        <div className="form-group">
          <label htmlFor="hb">HB</label>
          <input
            id="hb"
            type="number"
            step="0.1"
            value={formData.HB}
            onChange={(e) => handleInputChange('HB', e.target.value)}
            className={errors.HB ? 'error' : ''}
            placeholder="HB"
          />
          {errors.HB && <span className="error-text">{errors.HB}</span>}
        </div>

        {/* DR Positive */}
        <div className="form-group">
          <label htmlFor="dr_label">DR Positive</label>
          <select
            id="dr_label"
            value={formData.DR_Label}
            onChange={(e) => handleInputChange('DR_Label', e.target.value)}
            className={errors.DR_Label ? 'error' : ''}
          >
            <option value="" disabled>Select</option>
            <option value="0">No</option>
            <option value="1">Yes</option>
          </select>
          {errors.DR_Label && <span className="error-text">{errors.DR_Label}</span>}
        </div>
      </div>

      <div className="form-actions">
        <button
          type="submit"
          className={`submit-button ${isSubmitted ? 'submitted' : ''}`}
        >
          {isSubmitted ? (
            <>
              <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Data Saved
            </>
          ) : (
            'Proceed with Entered Data'
          )}
        </button>
      </div>

      <div className="form-info">
        <svg className="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <p className="info-text">
          All fields are required. Values will be used for eGFR prediction
          and CKD classification.
        </p>
      </div>
    </form>
  );
};

export default PatientInputForm;
