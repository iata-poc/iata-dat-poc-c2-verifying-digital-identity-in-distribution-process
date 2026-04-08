import { useState } from 'react';
import { IoArrowBack } from 'react-icons/io5';
import { IoChevronDown } from 'react-icons/io5';
import { CiCalendar } from 'react-icons/ci';
import { IoIosArrowDown } from 'react-icons/io';
import { useNavigate } from "react-router";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import MainBackground from "../shared/mainBackground.jsx";

const DEMO_PASSENGERS = [
    {
        label: 'Maria Sanches — SG passport',
        data: {
            firstName: 'Maria',
            lastName: 'Sanches',
            dateOfBirth: new Date('2001-04-13'),
            gender: 'female',
            country: 'singapore',
            idType: 'passport',
            idNumber: '874564310',
            idExpiry: '2031-04-13',
            email: 'm.sanches@gmail.com',
            primaryPhone: '+12025551234',
            secondaryPhone: '',
            skipSecondaryPhone: true,
        },
    },
    {
        label: 'John Doe — US passport',
        data: {
            firstName: 'John',
            lastName: 'Doe',
            dateOfBirth: new Date('1990-06-15'),
            gender: 'male',
            country: 'usa',
            idType: 'passport',
            idNumber: '523847612',
            idExpiry: '2030-08-20',
            email: 'john.doe@gmail.com',
            primaryPhone: '+12025551234',
            secondaryPhone: '',
            skipSecondaryPhone: true,
        },
    },
];

export const PassengerInfoPage = () => {
    const navigate = useNavigate();
    const bookingData = JSON.parse(sessionStorage.getItem('bookingData') || '{}');
    const [contactInfoOpen, setContactInfoOpen] = useState(true);
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const [showDemoTools, setShowDemoTools] = useState(false);
    const [passengerInfo, setPassengerInfo] = useState({
        firstName: '',
        lastName: '',
        dateOfBirth: null,
        gender: '',
        country: '',
        idType: '',
        idNumber: '',
        idExpiry: '',
        email: '',
        primaryPhone: '',
        secondaryPhone: '',
        skipSecondaryPhone: false
    });

    const [selectedDemoIndex, setSelectedDemoIndex] = useState(null);

    const handleAutofill = (demoData, index) => {
        setPassengerInfo({ ...demoData });
        setSelectedDemoIndex(index);
    };

    const handleChange = (field, value) => {
        setPassengerInfo(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // Map frontend form to backend passenger schema
        const countryCodeMap = { usa: 'US', uk: 'GB', canada: 'CA', uae: 'AE', singapore: 'SG' };
        const genderMap = { male: 'MALE', female: 'FEMALE' };
        const docTypeMap = { passport: 'PT', 'national-id': 'NI', 'drivers-license': 'DL' };

        const passenger = {
            type: 'ADT',
            firstName: passengerInfo.firstName,
            lastName: passengerInfo.lastName,
            dateOfBirth: passengerInfo.dateOfBirth
                ? passengerInfo.dateOfBirth.toISOString().split('T')[0]
                : '',
            gender: genderMap[passengerInfo.gender] || passengerInfo.gender.toUpperCase(),
            nationality: countryCodeMap[passengerInfo.country] || passengerInfo.country,
            document: {
                type: docTypeMap[passengerInfo.idType] || 'PT',
                number: passengerInfo.idNumber,
                issuingCountry: countryCodeMap[passengerInfo.country] || passengerInfo.country,
                expiryDate: passengerInfo.idExpiry || '2031-01-01',
            },
            contact: {
                email: passengerInfo.email,
                phone: passengerInfo.primaryPhone,
            },
        };

        const finalBooking = {
            ...bookingData,
            passengerInfo,
            passengers: [passenger],
        };

        sessionStorage.setItem('finalBooking', JSON.stringify(finalBooking));
        if (selectedDemoIndex !== null) {
            sessionStorage.setItem('selectedDemoIndex', String(selectedDemoIndex));
        }
        navigate('/confirmation');
    };

    const isPassengerFormComplete = passengerInfo.firstName && passengerInfo.lastName
        && passengerInfo.dateOfBirth && passengerInfo.gender && passengerInfo.country
        && passengerInfo.idType && passengerInfo.idNumber && passengerInfo.idExpiry
        && passengerInfo.email && passengerInfo.primaryPhone;

    const formatDate = (date) => {
        if (!date) return '';
        return date.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    };

    return (
        <div>
            <MainBackground/>

            <div className="d-flex passenger-info-page h-75 w-75 mt-5 overflow-auto">
                <form onSubmit={handleSubmit} className="w-100">
                    <div className="bg-white rounded-3 shadow-sm p-4 mb-4">
                        <div className="d-flex align-items-center justify-content-between">
                            <div className="d-flex align-items-center">
                                <button
                                    type="button"
                                    className="btn btn-link text-dark p-0 me-3 text-decoration-none"
                                    onClick={() => navigate(-1)}
                                >
                                    <IoArrowBack size={24} />
                                </button>
                                <div>
                                    <h4 className="mb-0 fw-bold">Book flight</h4>
                                    <p className="text-muted small mb-0">Fill in verified information and complete your booking.</p>
                                </div>
                            </div>
                            <div className="form-check form-switch">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id="demoToggle"
                                    checked={showDemoTools}
                                    onChange={(e) => setShowDemoTools(e.target.checked)}
                                />
                                <label className="form-check-label small text-muted" htmlFor="demoToggle">Demo</label>
                            </div>
                        </div>
                        {showDemoTools && (
                            <div className="mt-3 d-flex align-items-center gap-2 flex-wrap">
                                {DEMO_PASSENGERS.map((demo, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        className={`btn btn-sm ${selectedDemoIndex === idx ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => handleAutofill(demo.data, idx)}
                                    >
                                        {demo.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-3 shadow-sm p-4 mb-4">
                        <h5 className="mb-4 fw-semibold">Passenger</h5>

                        <div className="row g-3 mb-4">
                            <div className="col-md-6">
                                <input
                                    type="text"
                                    className="form-control form-control-lg"
                                    placeholder="First name"
                                    value={passengerInfo.firstName}
                                    onChange={(e) => handleChange('firstName', e.target.value)}
                                    required
                                />
                            </div>
                            <div className="col-md-6">
                                <input
                                    type="text"
                                    className="form-control form-control-lg"
                                    placeholder="Last name"
                                    value={passengerInfo.lastName}
                                    onChange={(e) => handleChange('lastName', e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="row g-3 mb-4">
                            <div className="col-md-6">
                                <div className="position-relative">
                                    <button
                                        type="button"
                                        className="btn w-100 text-start form-control-lg d-flex align-items-center justify-content-between date-picker-button"
                                        onClick={() => setDatePickerOpen(!datePickerOpen)}
                                    >
                                        <span className="d-flex align-items-center">
                                            <CiCalendar className="me-2 calendar-icon" />
                                            <span className={passengerInfo.dateOfBirth ? 'date-text-selected' : 'date-text-placeholder'}>
                                                {passengerInfo.dateOfBirth ? formatDate(passengerInfo.dateOfBirth) : 'Date of birth'}
                                            </span>
                                        </span>
                                        <IoIosArrowDown className="arrow-icon" />
                                    </button>

                                    {datePickerOpen && (
                                        <div className="position-absolute mt-1 date-picker-dropdown">
                                            <DatePicker
                                                selected={passengerInfo.dateOfBirth}
                                                onChange={(date) => {
                                                    handleChange('dateOfBirth', date);
                                                    setDatePickerOpen(false);
                                                }}
                                                inline
                                                maxDate={new Date()}
                                                showYearDropdown
                                                scrollableYearDropdown
                                                yearDropdownItemNumber={100}
                                                onClickOutside={() => setDatePickerOpen(false)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="col-md-6">
                                <select
                                    className="form-select form-select-lg"
                                    value={passengerInfo.gender}
                                    onChange={(e) => handleChange('gender', e.target.value)}
                                    required
                                >
                                    <option value="" disabled hidden>Gender</option>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                </select>
                            </div>
                        </div>

                        <div className="row g-3 mb-4">
                            <div className="col-md-12">
                                <select
                                    className="form-select form-select-lg"
                                    value={passengerInfo.country}
                                    onChange={(e) => handleChange('country', e.target.value)}
                                    required
                                >
                                    <option value="">Country of nationality</option>
                                    <option value="usa">United States</option>
                                    <option value="uk">United Kingdom</option>
                                    <option value="canada">Canada</option>
                                    <option value="uae">United Arab Emirates</option>
                                    <option value="singapore">Singapore</option>
                                </select>
                            </div>
                        </div>

                        <div className="row g-3">
                            <div className="col-md-4">
                                <select
                                    className="form-select form-select-lg"
                                    value={passengerInfo.idType}
                                    onChange={(e) => handleChange('idType', e.target.value)}
                                    required
                                >
                                    <option value="">ID type</option>
                                    <option value="passport">Passport</option>
                                    <option value="national-id">National ID</option>
                                    <option value="drivers-license">Driver's License</option>
                                </select>
                            </div>
                            <div className="col-md-4">
                                <input
                                    type="text"
                                    className="form-control form-control-lg"
                                    placeholder="ID number"
                                    value={passengerInfo.idNumber}
                                    onChange={(e) => handleChange('idNumber', e.target.value)}
                                    required
                                />
                            </div>
                            <div className="col-md-4">
                                <input
                                    type="date"
                                    className="form-control form-control-lg"
                                    placeholder="ID expiry date"
                                    value={passengerInfo.idExpiry}
                                    onChange={(e) => handleChange('idExpiry', e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    {/* Card 3: Contact Info Section */}
                    <div className="bg-white rounded-3 shadow-sm p-4 mb-4">
                        <div
                            className="d-flex align-items-center justify-content-between mb-4 cursor-pointer"
                            onClick={() => setContactInfoOpen(!contactInfoOpen)}
                        >
                            <h5 className="mb-0 fw-semibold">Contact Info</h5>
                            <IoChevronDown
                                size={24}
                                className={`chevron-icon ${contactInfoOpen ? 'chevron-rotate' : ''}`}
                            />
                        </div>

                        {contactInfoOpen && (
                            <>
                                <div className="row g-3 mb-4">
                                    <div className="col-md-12">
                                        <input
                                            type="email"
                                            className="form-control form-control-lg"
                                            placeholder="Email address"
                                            value={passengerInfo.email}
                                            onChange={(e) => handleChange('email', e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="row g-3 mb-4">
                                    <div className="col-md-6">
                                        <input
                                            type="tel"
                                            className="form-control form-control-lg"
                                            placeholder="Primary phone number"
                                            value={passengerInfo.primaryPhone}
                                            onChange={(e) => handleChange('primaryPhone', e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <input
                                            type="tel"
                                            className="form-control form-control-lg"
                                            placeholder="Secondary phone number"
                                            value={passengerInfo.secondaryPhone}
                                            onChange={(e) => handleChange('secondaryPhone', e.target.value)}
                                            disabled={passengerInfo.skipSecondaryPhone}
                                        />
                                    </div>
                                </div>

                                <div className="form-check">
                                    <input
                                        className="form-check-input"
                                        type="checkbox"
                                        id="skipSecondaryPhone"
                                        checked={passengerInfo.skipSecondaryPhone}
                                        onChange={(e) => {
                                            handleChange('skipSecondaryPhone', e.target.checked);
                                            if (e.target.checked) {
                                                handleChange('secondaryPhone', '');
                                            }
                                        }}
                                    />
                                    <label className="form-check-label" htmlFor="skipSecondaryPhone">
                                        Skip secondary phone
                                    </label>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Book Flight Button */}
                    <div className="d-flex justify-content-end mt-4 mb-5">
                        <button
                            type="submit"
                            className="btn btn-lg px-5 book-flight-button"
                            disabled={!isPassengerFormComplete}
                        >
                            Book Flight
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
