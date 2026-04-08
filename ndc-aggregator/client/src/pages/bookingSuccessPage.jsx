import MainBackground from "../shared/mainBackground.jsx";
import { IoCheckmark } from 'react-icons/io5';
import { useNavigate } from "react-router";
import { getAirlineName } from "../services/helpers.js";

export const BookingSuccessPage = () => {
    const navigate = useNavigate();
    const orderResult = JSON.parse(sessionStorage.getItem('orderResult') || '{}');

    return (
        <div>
            <MainBackground/>

            <div className="d-flex passenger-info-page h-75 w-50 mt-5">
                <div className="w-100">
                    <div className="bg-white rounded-3 shadow-sm p-5 d-flex flex-column align-items-center justify-content-center" style={{minHeight: '70vh'}}>
                        {/* Green Circle with Checkmark */}
                        <div
                            className="rounded-circle d-flex align-items-center justify-content-center mb-4"
                            style={{
                                width: '100px',
                                height: '100px',
                                backgroundColor: '#059669'
                            }}
                        >
                            <IoCheckmark size={60} color="white" />
                        </div>

                        {/* Success Message */}
                        <h3 className="fw-bold text-center mb-4">Booking completed<br/>successfully!</h3>

                        {/* Order Details */}
                        {orderResult.bookingReference && (
                            <div className="text-center mb-4">
                                <div className="mb-2">
                                    <span className="text-muted">Booking Reference: </span>
                                    <span className="fw-bold fs-5">{orderResult.bookingReference}</span>
                                </div>
                                {orderResult.airlineCode && (
                                    <div className="mb-2">
                                        <span className="text-muted">Airline: </span>
                                        <span className="fw-semibold">{getAirlineName(orderResult.airlineCode)}</span>
                                    </div>
                                )}
                                {orderResult.status && (
                                    <div className="mb-2">
                                        <span className="text-muted">Status: </span>
                                        <span className="badge bg-success">{orderResult.status}</span>
                                    </div>
                                )}
                                {orderResult.totalPrice && (
                                    <div className="mb-2">
                                        <span className="text-muted">Total: </span>
                                        <span className="fw-bold price-tag">
                                            {orderResult.totalPrice.total} {orderResult.totalPrice.currency}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            className="btn btn-lg px-5 mt-3 book-flight-button"
                            onClick={() => {
                                sessionStorage.removeItem('bookingData');
                                sessionStorage.removeItem('finalBooking');
                                sessionStorage.removeItem('orderResult');
                                sessionStorage.removeItem('selectedDemoIndex');
                                navigate('/');
                            }}
                        >
                            Back to Home
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
