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
  const [formData, setFormData] = useState<PatientData>({
    patientId: '',
    age: 50,
    gender: 'M',
    Durationofdiabetes: 5,
    BMI: 25,
    Hypertension: 0,
    OHA: 1,
    INSULIN: 0,
    HBA: 5.5,
    CHO: 180,
    TRI: 150,
    HB: 12.0,
    DR_Label: 0,
  });

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (
    field: keyof PatientData,
    value: string | number
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: typeof prev[field] === 'number' ? Number(value) : value,
    }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
    setIsSubmitted(false);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.patientId.trim()) {
      newErrors.patientId = 'Patient ID is required';
    }
    if (formData.age < 0 || formData.age > 120) {
      newErrors.age = 'Age must be between 0 and 120';
    }
    if (formData.BMI < 10 || formData.BMI > 60) {
      newErrors.BMI = 'Invalid BMI';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (validateForm()) {
      onSubmit(formData);
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
          <label htmlFor="age">age</label>
          <input
            id="age"
            type="number"
            min="0"
            max="120"
            value={formData.age}
            onChange={(e) => handleInputChange('age', e.target.value)}
          />
        </div>

        {/* 3. Gender */}
        <div className="form-group">
          <label htmlFor="gender">gender</label>
          <select
            id="gender"
            value={formData.gender}
            onChange={(e) => handleInputChange('gender', e.target.value)}
          >
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
        </div>

        {/* 4. Duration of Diabetes */}
        <div className="form-group">
          <label htmlFor="duration">Durationofdiabetes</label>
          <input
            id="duration"
            type="number"
            value={formData.Durationofdiabetes}
            onChange={(e) =>
              handleInputChange('Durationofdiabetes', e.target.value)
            }
          />
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
          />
        </div>

        {/* 6. Hypertension */}
        <div className="form-group">
          <label htmlFor="hypertension">Hypertension</label>
          <select
            id="hypertension"
            value={formData.Hypertension}
            onChange={(e) => handleInputChange('Hypertension', e.target.value)}
          >
            <option value="0">No</option>
            <option value="1">Yes</option>
          </select>
        </div>

        {/* 7. OHA */}
        <div className="form-group">
          <label htmlFor="oha">OHA</label>
          <select
            id="oha"
            value={formData.OHA}
            onChange={(e) => handleInputChange('OHA', e.target.value)}
          >
            <option value="0">No</option>
            <option value="1">Yes</option>
          </select>
        </div>

        {/* 8. INSULIN */}
        <div className="form-group">
          <label htmlFor="insulin">INSULIN</label>
          <select
            id="insulin"
            value={formData.INSULIN}
            onChange={(e) => handleInputChange('INSULIN', e.target.value)}
          >
            <option value="0">No</option>
            <option value="1">Yes</option>
          </select>
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
          />
        </div>

        {/* 10. CHO */}
        <div className="form-group">
          <label htmlFor="cho">CHO</label>
          <input
            id="cho"
            type="number"
            value={formData.CHO}
            onChange={(e) => handleInputChange('CHO', e.target.value)}
          />
        </div>

        {/* 11. TRI */}
        <div className="form-group">
          <label htmlFor="tri">TRI</label>
          <input
            id="tri"
            type="number"
            value={formData.TRI}
            onChange={(e) => handleInputChange('TRI', e.target.value)}
          />
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
          />
        </div>

        {/* DR Positive */}
        <div className="form-group">
          <label htmlFor="dr_label">DR Positive</label>
          <select
            id="dr_label"
            value={formData.DR_Label}
            onChange={(e) => handleInputChange('DR_Label', e.target.value)}
          >
            <option value="0">No</option>
            <option value="1">Yes</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        className={`submit-button ${isSubmitted ? 'submitted' : ''}`}
      >
        {isSubmitted ? '✓ Data Saved' : 'Proceed with Entered Data'}
      </button>

      <div className="form-info">
        <p className="info-text">
          ℹ️ All fields are required. Values will be used for eGFR prediction
          and CKD classification.
        </p>
      </div>
    </form>
  );
};

export default PatientInputForm;
