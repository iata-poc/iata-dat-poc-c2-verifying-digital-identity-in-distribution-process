import MainBackground from "../shared/mainBackground.jsx";
import { IoCheckmarkCircle } from 'react-icons/io5';
import { IoCheckmark, IoCloseCircleOutline } from 'react-icons/io5';
import { MdOutlineWatchLater } from "react-icons/md";
import { useState, useEffect } from "react";
import { BsCreditCard } from "react-icons/bs";
import { useNavigate } from "react-router";
import { createOrder, repriceOffer } from "../services/api.js";
import { formatPrice } from "../services/helpers.js";

const DEMO_PAYMENTS = [
    {
        label: 'Visa — Maria Sanches',
        card: { cardType: 'visa', cardNumber: '4111111111111111', expiry: '12/28', securityCode: '123' },
        cardholder: { firstName: 'Maria', familyName: 'Sanches', address: '1 Raffles Place', city: 'Singapore', country: 'singapore', postCode: '048616' },
    },
    {
        label: 'Mastercard — John Doe',
        card: { cardType: 'mastercard', cardNumber: '5500000000000004', expiry: '06/29', securityCode: '456' },
        cardholder: { firstName: 'John', familyName: 'Doe', address: '123 Main St', city: 'New York', country: 'usa', postCode: '10001' },
    },
];

export const ConfirmationPage = () => {
    const navigate = useNavigate();
    const finalBooking = JSON.parse(sessionStorage.getItem('finalBooking') || '{}');

    const { searchId, searchData, flight, selectedOffer, passengerInfo, passengers } = finalBooking;

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
        const day = String(date.getDate()).padStart(2, '0');
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        const year = date.getFullYear();
        return `${weekday}, ${day} ${month} ${year}`;
    };

    const formatDateShort = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toISOString().split('T')[0];
    };

    const isRoundTrip = searchData?.returnDate !== null && searchData?.returnDate !== undefined;

    const [repricing, setRepricing] = useState(true);
    const [repriceResult, setRepriceResult] = useState(null);
    const [repriceError, setRepriceError] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('card');
    const [submitting, setSubmitting] = useState(false);
    const [orderError, setOrderError] = useState(null);
    const [cardDetails, setCardDetails] = useState({
        cardType: '', cardNumber: '', expiry: '', securityCode: ''
    });
    const [cardholderDetails, setCardholderDetails] = useState({
        firstName: '', familyName: '', address: '', city: '', country: '', postCode: ''
    });
    const [agreeTerms, setAgreeTerms] = useState(false);
    const [showDemoTools, setShowDemoTools] = useState(false);
    const [selectedDemoIndex, setSelectedDemoIndex] = useState(null);

    // Auto-apply demo payment if a demo user was selected on passenger page
    useEffect(() => {
        const demoIndex = sessionStorage.getItem('selectedDemoIndex');
        if (demoIndex !== null) {
            const idx = parseInt(demoIndex, 10);
            if (DEMO_PAYMENTS[idx]) {
                handleDemoAutofill(DEMO_PAYMENTS[idx]);
                setSelectedDemoIndex(idx);
                setShowDemoTools(true);
            }
            sessionStorage.removeItem('selectedDemoIndex');
        }
    }, []);

    // Reprice on mount
    useEffect(() => {
        if (!searchId || !selectedOffer?.offerId) {
            setRepricing(false);
            return;
        }

        const doReprice = async () => {
            try {
                console.log('[Confirmation] Repricing offer:', selectedOffer.offerId);
                const result = await repriceOffer(searchId, selectedOffer.offerId);
                console.log('[Confirmation] Reprice result:', result);
                setRepriceResult(result);
            } catch (err) {
                console.error('[Confirmation] Reprice failed:', err);
                setRepriceError(err.message);
            } finally {
                setRepricing(false);
            }
        };

        doReprice();
    }, []);

    const handleDemoAutofill = (demo, idx) => {
        setCardDetails({ ...demo.card });
        setCardholderDetails({ ...demo.cardholder });
        setAgreeTerms(true);
        if (idx !== undefined) setSelectedDemoIndex(idx);
    };

    const isPaymentComplete = cardDetails.cardType && cardDetails.cardNumber
        && cardDetails.expiry && cardDetails.securityCode
        && cardholderDetails.firstName && cardholderDetails.familyName
        && cardholderDetails.address && cardholderDetails.city
        && cardholderDetails.country && cardholderDetails.postCode
        && agreeTerms;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setOrderError(null);

        try {
            const result = await createOrder(
                searchId,
                selectedOffer?.offerId,
                passengers,
                { type: paymentMethod, card: cardDetails, cardholder: cardholderDetails }
            );

            // Store order result and navigate to success
            sessionStorage.setItem('orderResult', JSON.stringify(result));
            navigate('/booking-success');
        } catch (err) {
            console.error('Order creation failed:', err);
            setOrderError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const price = selectedOffer?.price;
    // Use repriced price if available, otherwise fallback to original
    const displayPrice = repriceResult?.repricedPrice || price;
    const fareDetails = selectedOffer?.fareDetails;
    const baggage = fareDetails?.baggage || {};
    const flexibility = fareDetails?.flexibility || {};

    return (
        <div>
            <MainBackground/>

            <div className="d-flex passenger-info-page h-75 w-75 mt-5 overflow-auto">
                <div className="w-100">
                    <div className="bg-white rounded-3 shadow-sm p-4 mb-4">
                        {/* Booking Confirmed Header */}
                        <div className="mb-4">
                            <div className="d-flex align-items-start justify-content-between">
                                <div className="d-flex align-items-start">
                                    <IoCheckmarkCircle size={48} className="text-success me-3 flex-shrink-0" />
                                    <div>
                                        <h5 className="mb-1 fw-bold">Booking confirmed</h5>
                                        <p className="text-muted small mb-0">Client identity has been verified and booking is ready to be completed</p>
                                    </div>
                                </div>
                                <div className="form-check form-switch flex-shrink-0 ms-3">
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
                                    {DEMO_PAYMENTS.map((demo, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            className={`btn btn-sm ${selectedDemoIndex === idx ? 'btn-primary' : 'btn-outline-primary'}`}
                                            onClick={() => handleDemoAutofill(demo, idx)}
                                        >
                                            {demo.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Repricing status */}
                            {repricing && (
                                <div className="mt-3 p-3 rounded d-flex align-items-center" style={{backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE'}}>
                                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                    <span className="small">Verifying current price with airline...</span>
                                </div>
                            )}
                            {!repricing && repriceResult?.priceChanged && (
                                <div className="mt-3 p-3 rounded" style={{backgroundColor: '#FEF3C7', border: '1px solid #F59E0B'}}>
                                    <div className="small fw-semibold">Price has changed</div>
                                    <div className="small">
                                        Original: {formatPrice(repriceResult.originalPrice?.total, repriceResult.originalPrice?.currency)}
                                        {' → '}
                                        Updated: {formatPrice(repriceResult.repricedPrice?.total, repriceResult.repricedPrice?.currency)}
                                        {repriceResult.priceIncreased && (
                                            <span className="text-danger ms-2">(+{formatPrice(repriceResult.priceDifference, repriceResult.repricedPrice?.currency)})</span>
                                        )}
                                        {repriceResult.priceDecreased && (
                                            <span className="text-success ms-2">({formatPrice(repriceResult.priceDifference, repriceResult.repricedPrice?.currency)})</span>
                                        )}
                                    </div>
                                </div>
                            )}
                            {!repricing && !repriceResult && repriceError && (
                                <div className="mt-3 p-3 rounded" style={{backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5'}}>
                                    <div className="small fw-semibold">Price verification failed</div>
                                    <div className="small text-muted">{repriceError}. You can still proceed with the original price.</div>
                                </div>
                            )}
                            {!repricing && repriceResult && !repriceResult.priceChanged && (
                                <div className="mt-3 p-3 rounded d-flex align-items-center" style={{backgroundColor: '#F0FDF4', border: '1px solid #86EFAC'}}>
                                    <IoCheckmarkCircle size={18} className="text-success me-2" />
                                    <span className="small">Price verified — no changes</span>
                                </div>
                            )}
                        </div>

                        {/* Flight Information Card */}
                        <div className="rounded-3 p-4 mb-4" style={{backgroundColor: '#0596691A', border: '1px solid #047857'}}>
                            <div className="d-flex align-items-start mb-3">
                                <div className="form-check">
                                    <input
                                        type="checkbox"
                                        className="form-check-input confirmation-checkbox"
                                        checked
                                        readOnly
                                        style={{marginTop: '2px'}}
                                    />
                                </div>
                                <div className="ms-2">
                                    <div className="fw-semibold">{selectedOffer?.cabinName || 'Economy Class'}</div>
                                    <div className="small text-muted">
                                        {searchData?.from} to {searchData?.to}/{flight?.arrivalAirport}
                                    </div>
                                    <div className="small text-muted">
                                        {formatDate(searchData?.departureDate)}
                                    </div>
                                </div>
                            </div>

                            <div className="d-flex align-items-center justify-content-between mb-2">
                                <div className="text-center">
                                    <div className="fs-4">{flight?.departureTime}</div>
                                    <div className="small">{flight?.departureAirport}</div>
                                </div>

                                <div className="flex-grow-1 mx-4 d-flex align-items-center gap-3">
                                    <div className="flex-grow-1 border-top"></div>
                                    <span className="text-muted small text-nowrap">
                                        <MdOutlineWatchLater className={'clock'} />
                                        {flight?.duration}
                                    </span>
                                    <div className="flex-grow-1 border-top"></div>
                                </div>

                                <div className="text-center">
                                    <div className="fs-4">{flight?.arrivalTime}</div>
                                    <div className="small">{flight?.arrivalAirport}</div>
                                </div>
                            </div>

                            <div className="d-flex justify-content-between align-items-center mt-2">
                                <div className="small">Operated by {flight?.airlineName}</div>
                                <div className="small">{flight?.flightNumber}</div>
                            </div>
                        </div>

                        {/* Verified Passenger Information */}
                        <div className="mb-4">
                            <h6 className="fw-bold mb-3">Verified Passenger Information</h6>

                            <div className="p-3 rounded" style={{backgroundColor: '#F4F4F5'}}>
                                <div className="row g-3 mb-3">
                                    <div className="col-md-6">
                                        <div className="small text-muted mb-1">Full name</div>
                                        <div>{passengerInfo?.firstName} {passengerInfo?.lastName}</div>
                                    </div>
                                </div>

                                <div className="row g-3 mb-3">
                                    <div className="col-md-6">
                                        <div className="small text-muted mb-1">Date of birth</div>
                                        <div>{formatDateShort(passengerInfo?.dateOfBirth)}</div>
                                    </div>
                                    <div className="col-md-6">
                                        <div className="small text-muted mb-1">Gender</div>
                                        <div className="text-capitalize">{passengerInfo?.gender}</div>
                                    </div>
                                </div>

                                <div className="row g-3">
                                    <div className="col-md-6">
                                        <div className="small text-muted mb-1">Document number</div>
                                        <div>{passengerInfo?.idNumber}</div>
                                    </div>
                                    <div className="col-md-6">
                                        <div className="small text-muted mb-1">Document expiry</div>
                                        <div>{passengerInfo?.idExpiry || 'N/A'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Fare Summary */}
                        <div>
                            <h6 className="fw-bold mb-3">Fare Summary</h6>

                            <div className="rounded-3 p-3 position-relative" style={{backgroundColor: '#F4F4F5'}}>
                                <IoCheckmarkCircle
                                    size={24}
                                    className="text-success position-absolute"
                                    style={{top: '15px', right: '15px'}}
                                />

                                <div className="mb-3">
                                    <div>{selectedOffer?.cabinName || 'Economy Class'}</div>
                                    <div className="small text-muted">{fareDetails?.priceClassName || ''}</div>
                                </div>

                                <hr className="my-3" style={{borderColor: '#D1D5DB'}} />

                                <div className="row mb-3">
                                    <div className="col-md-6">
                                        <div className="fw-semibold mb-2 small">Baggage included</div>
                                        <div className="small d-flex align-items-center mb-1">
                                            <IoCheckmark className="me-1" size={16} />
                                            <span>Personal item</span>
                                        </div>
                                        <div className="small d-flex align-items-center mb-1">
                                            {baggage.cabinBag ?
                                                <IoCheckmark className="me-1" size={16} /> :
                                                <IoCloseCircleOutline className="me-1" size={16} />
                                            }
                                            <span>Carry-on bag</span>
                                        </div>
                                        <div className="small d-flex align-items-center">
                                            {baggage.checkedBags ?
                                                <IoCheckmark className="me-1" size={16} /> :
                                                <IoCloseCircleOutline className="me-1" size={16} />
                                            }
                                            <span>Check in bag</span>
                                        </div>
                                    </div>
                                    <div className="col-md-6">
                                        <div className="fw-semibold mb-2 small">Flexibility</div>
                                        <div className="small d-flex align-items-center mb-1">
                                            {flexibility.refundable ?
                                                <IoCheckmark className="me-1" size={16} /> :
                                                <IoCloseCircleOutline className="me-1" size={16} />
                                            }
                                            <span>Cancellation</span>
                                        </div>
                                        <div className="small d-flex align-items-center">
                                            {flexibility.changeable ?
                                                <IoCheckmark className="me-1" size={16} /> :
                                                <IoCloseCircleOutline className="me-1" size={16} />
                                            }
                                            <span>Change</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="d-flex justify-content-end align-items-center pt-2">
                                    <div className="small me-2">{isRoundTrip ? 'Round Trip' : 'One Way'}</div>
                                    {repricing ? (
                                        <div className="d-flex align-items-center">
                                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                            <span className="small text-muted">Verifying price...</span>
                                        </div>
                                    ) : (
                                        <div className="fw-bold fs-5 price-tag">
                                            {displayPrice ? formatPrice(displayPrice.total, displayPrice.currency) : ''}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Payment Section */}
                        <div>
                            <h6 className="fw-bold mb-3">Payment</h6>

                            <div className="rounded-3 p-3 mb-4" style={{backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB'}}>
                                <div className="small text-muted mb-3">Choose a way to pay</div>

                                <div className="d-flex align-items-start mb-3 p-3 rounded" style={{border: '1px solid #E5E7EB'}}>
                                    <input
                                        className="form-check-input confirmation-checkbox me-3 flex-shrink-0"
                                        type="radio"
                                        name="paymentMethod"
                                        id="cardPayment"
                                        checked={paymentMethod === 'card'}
                                        onChange={() => setPaymentMethod('card')}
                                        style={{marginTop: '2px'}}
                                    />
                                    <label className="form-check-label d-flex align-items-center w-100" htmlFor="cardPayment" style={{cursor: 'pointer'}}>
                                        <BsCreditCard size={20} className="me-2" />
                                        <span>Card</span>
                                    </label>
                                </div>

                                <div className="d-flex align-items-start p-3 rounded" style={{border: '1px solid #E5E7EB'}}>
                                    <input
                                        className="form-check-input confirmation-checkbox me-3 flex-shrink-0"
                                        type="radio"
                                        name="paymentMethod"
                                        id="revolutPayment"
                                        checked={paymentMethod === 'revolut'}
                                        onChange={() => setPaymentMethod('revolut')}
                                        style={{marginTop: '2px'}}
                                    />
                                    <label className="form-check-label w-100" htmlFor="revolutPayment" style={{cursor: 'pointer'}}>
                                        <div className="d-flex align-items-center mb-2">
                                            <span>Revolut Pay</span>
                                        </div>
                                        <div>
                                            <span className="badge" style={{backgroundColor: '#E8F5E9', color: '#2E7D32', fontSize: '10px', padding: '2px 6px'}}>OFFER</span>
                                            <span className="small text-muted ms-2">Earn 10x more RevPoints</span>
                                        </div>
                                        <div className="mt-1">
                                            <a href="#" className="small" style={{color: '#0EA5E9', textDecoration: 'none'}}>Learn more</a>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <form onSubmit={handleSubmit}>
                                <div className="rounded-3 p-3 mb-4" style={{backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB'}}>
                                    <h6 className="mb-3">Card details</h6>
                                    <div className="row g-3 mb-3">
                                        <div className="col-md-6">
                                            <select className="form-select" required value={cardDetails.cardType} onChange={(e) => setCardDetails(prev => ({...prev, cardType: e.target.value}))}>
                                                <option value="">Card Type</option>
                                                <option value="visa">Visa</option>
                                                <option value="mastercard">Mastercard</option>
                                                <option value="amex">American Express</option>
                                            </select>
                                        </div>
                                        <div className="col-md-6">
                                            <input type="text" className="form-control" placeholder="Card Number" required value={cardDetails.cardNumber} onChange={(e) => setCardDetails(prev => ({...prev, cardNumber: e.target.value}))} />
                                        </div>
                                    </div>
                                    <div className="row g-3">
                                        <div className="col-md-6">
                                            <input type="text" className="form-control" placeholder="Expiry MM/YY" required value={cardDetails.expiry} onChange={(e) => setCardDetails(prev => ({...prev, expiry: e.target.value}))} />
                                        </div>
                                        <div className="col-md-6 position-relative">
                                            <input type="text" className="form-control" placeholder="Security Code" required value={cardDetails.securityCode} onChange={(e) => setCardDetails(prev => ({...prev, securityCode: e.target.value}))} />
                                            <BsCreditCard
                                                size={20}
                                                className="position-absolute"
                                                style={{right: '15px', top: '50%', transform: 'translateY(-50%)', color: '#6B7280'}}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-3 p-3 mb-4" style={{backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB'}}>
                                    <h6 className="mb-3">Cardholder details</h6>
                                    <div className="row g-3 mb-3">
                                        <div className="col-md-6">
                                            <input type="text" className="form-control" placeholder="First Name" required value={cardholderDetails.firstName} onChange={(e) => setCardholderDetails(prev => ({...prev, firstName: e.target.value}))} />
                                        </div>
                                        <div className="col-md-6">
                                            <input type="text" className="form-control" placeholder="Family Name" required value={cardholderDetails.familyName} onChange={(e) => setCardholderDetails(prev => ({...prev, familyName: e.target.value}))} />
                                        </div>
                                    </div>
                                    <div className="row g-3 mb-3">
                                        <div className="col-md-6">
                                            <input type="text" className="form-control" placeholder="Address" required value={cardholderDetails.address} onChange={(e) => setCardholderDetails(prev => ({...prev, address: e.target.value}))} />
                                        </div>
                                        <div className="col-md-6">
                                            <input type="text" className="form-control" placeholder="City" required value={cardholderDetails.city} onChange={(e) => setCardholderDetails(prev => ({...prev, city: e.target.value}))} />
                                        </div>
                                    </div>
                                    <div className="row g-3">
                                        <div className="col-md-6">
                                            <select className="form-select" required value={cardholderDetails.country} onChange={(e) => setCardholderDetails(prev => ({...prev, country: e.target.value}))}>
                                                <option value="">Country</option>
                                                <option value="usa">United States</option>
                                                <option value="uk">United Kingdom</option>
                                                <option value="canada">Canada</option>
                                                <option value="uae">United Arab Emirates</option>
                                                <option value="singapore">Singapore</option>
                                            </select>
                                        </div>
                                        <div className="col-md-6">
                                            <input type="text" className="form-control" placeholder="Post/Zip Code" required value={cardholderDetails.postCode} onChange={(e) => setCardholderDetails(prev => ({...prev, postCode: e.target.value}))} />
                                        </div>
                                    </div>
                                </div>

                                {/* Terms */}
                                <div className="p-3 rounded mb-3" style={{backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE'}}>
                                    <div className="form-check mb-3">
                                        <input className="form-check-input" type="checkbox" id="agreeTerms" required checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />
                                        <label className="form-check-label small" htmlFor="agreeTerms">
                                            I authorise Thracian Wings to debit the total amount from my chosen payment method and confirm that I have read and accepted the{' '}
                                            <a href="#">Terms and Conditions</a>, <a href="#">Privacy Statement</a>, <a href="#">Dangerous Goods Restrictions</a>,{' '}
                                            <a href="#">Conditions of Carriage</a> and <a href="#">Conditions of Contract</a>.
                                        </label>
                                    </div>

                                    <div className="d-flex justify-content-between align-items-center">
                                        <span>Total</span>
                                        <span className="fw-bold fs-4 price-tag">
                                            {displayPrice ? formatPrice(displayPrice.total, displayPrice.currency) : ''}
                                        </span>
                                    </div>
                                </div>

                                {orderError && (
                                    <div className="alert alert-danger mb-3" role="alert">
                                        <strong>Booking failed:</strong> {orderError}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    className="btn btn-lg w-100 book-flight-button"
                                    disabled={submitting || repricing || !isPaymentComplete}
                                >
                                    {submitting ? (
                                        <>
                                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                            Processing...
                                        </>
                                    ) : (
                                        'Complete Purchase & Booking'
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
