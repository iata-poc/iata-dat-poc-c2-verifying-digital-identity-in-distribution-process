import { Modal } from 'react-bootstrap';
import { IoIosArrowForward } from 'react-icons/io';
import { FiArrowRight } from "react-icons/fi";
import { LuArrowLeftRight } from "react-icons/lu";
import { IoCheckmark, IoCloseCircleOutline } from 'react-icons/io5';
import { useState } from 'react';
import {
    getAirlineName,
    formatTime,
    formatPrice,
    formatCabinName,
    groupFaresByCabin,
    computeTotalTravelTime,
} from "../services/helpers.js";
import { AIRPORTS } from "../shared/searchForm.jsx";

const getCityName = (code) => AIRPORTS.find(a => a.code === code)?.city || code;

function FlightDetailsModal({ show, onHide, flight, searchData, searchId, onContinue }) {
    const [selectedCabin, setSelectedCabin] = useState(null);

    const formatDate = (date) => {
        if (!date) return '';
        const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
        return d.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    };

    if (!flight) return null;

    const isRoundTrip = searchData?.returnDate !== null && searchData?.returnDate !== undefined;
    const outboundSegs = flight.segments?.filter(s => s.journeyDirection === 'outbound') || [];
    const firstOutbound = outboundSegs[0] || flight.segments?.[0];
    const lastOutbound = outboundSegs[outboundSegs.length - 1] || firstOutbound;
    // Try explicit inbound first, then fallback: segment departing from the destination airport
    const inboundSegs = flight.segments?.filter(s => s.journeyDirection === 'inbound') || [];
    const firstInbound = inboundSegs[0] || flight.segments?.find(s => s.departureAirport === searchData?.to && s !== firstOutbound);
    const lastInbound = inboundSegs[inboundSegs.length - 1] || firstInbound;

    // Group fare options by cabin class
    const cabinGroups = groupFaresByCabin(flight.fareOptions || []);
    const cabinOrder = ['ECONOMY', 'PREMIUM ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'];
    const sortedCabins = Object.keys(cabinGroups).sort((a, b) => {
        const ai = cabinOrder.indexOf(a.toUpperCase());
        const bi = cabinOrder.indexOf(b.toUpperCase());
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    // Auto-select first cabin on open
    const activeCabin = selectedCabin && cabinGroups[selectedCabin] ? selectedCabin : sortedCabins[0];
    const activeOption = cabinGroups[activeCabin];

    const handleContinue = () => {
        if (!activeOption) return;

        const bookingData = {
            searchId,
            searchData,
            flight: {
                airlineCode: flight.airlineCode,
                airlineName: getAirlineName(flight.airlineCode),
                flightGroupKey: flight.flightGroupKey,
                segments: flight.segments,
                departureTime: formatTime(firstOutbound?.departureTime),
                arrivalTime: formatTime(lastOutbound?.arrivalTime),
                departureAirport: firstOutbound?.departureAirport,
                arrivalAirport: lastOutbound?.arrivalAirport,
                duration: computeTotalTravelTime(firstOutbound, lastOutbound),
                flightNumber: firstOutbound?.flightNumber,
            },
            selectedOffer: {
                offerId: activeOption.offerId,
                price: activeOption.price,
                fareDetails: activeOption.fareDetails,
                cabinName: formatCabinName(activeCabin),
            },
        };

        onContinue?.(bookingData);
        setSelectedCabin(null);
        onHide();
    };

    const handleClose = () => {
        setSelectedCabin(null);
        onHide();
    };

    return (
        <Modal show={show} onHide={handleClose} size="lg" centered>
            <Modal.Body className="bg-light p-3">
                {/* Header */}
                <div className="d-flex align-items-center justify-content-between mb-2">
                    <h5 className="mb-0">
                        {getCityName(searchData?.from)}
                        {searchData?.tripType === "one-way" ? (
                            <FiArrowRight className={'mx-3 arrows'}/>
                        ) : (
                            <LuArrowLeftRight className={'mx-3 arrows'}/>
                        )}
                        {getCityName(searchData?.to)}
                    </h5>
                </div>

                {/* Departure/Return sections */}
                <div className="row g-3 mb-2">
                    <div className={isRoundTrip ? "col-md-6" : "col-md-12"}>
                        <div className="bg-white rounded-3 p-3 shadow-sm flight-detail-bubble">
                            <span className="badge pop-button fw-normal px-3 py-2 mb-3">Departure</span>
                            <div className="mb-2">
                                <span className="fw-semibold">
                                    {getCityName(searchData?.from)}
                                    <FiArrowRight className={'mx-2'}/>
                                    {getCityName(searchData?.to)}
                                </span>
                            </div>
                            <div className="text-muted small mb-3">
                                <span>{formatDate(searchData.departureDate)}</span>
                                <span className={'mx-2'}>|</span>
                                <span>Flight duration {computeTotalTravelTime(firstOutbound, lastOutbound)}</span>
                                {outboundSegs.length > 1 && (
                                    <><span className={'mx-2'}>|</span><span>{outboundSegs.length - 1} stop</span></>
                                )}
                            </div>
                            <div className="mb-2">
                                <span className={'fs-6 fw-semibold'}>{formatTime(firstOutbound?.departureTime)}</span>
                                <span className={'mx-2'}>|</span>
                                <span>{getCityName(firstOutbound?.departureAirport)}, {firstOutbound?.departureAirport}</span>
                            </div>
                            <div>
                                <span className={'fs-6 fw-semibold'}>{formatTime(lastOutbound?.arrivalTime)}</span>
                                <span className={'mx-2'}>|</span>
                                <span>{getCityName(lastOutbound?.arrivalAirport)}, {lastOutbound?.arrivalAirport}</span>
                            </div>
                        </div>
                    </div>

                    {isRoundTrip && (
                        <div className="col-md-6">
                            <div className="bg-white rounded-3 p-3 shadow-sm flight-detail-bubble">
                                <span className="badge pop-button fw-normal px-3 py-2 mb-3">Return</span>
                                <div className="mb-2">
                                    <span className="fw-semibold">
                                        {getCityName(searchData?.to)}
                                        <FiArrowRight className={'mx-2'}/>
                                        {getCityName(searchData?.from)}
                                    </span>
                                </div>
                                <div className="text-muted small mb-3">
                                    <span>{formatDate(searchData.returnDate)}</span>
                                    {firstInbound?.duration && (
                                        <>
                                            <span className={'mx-2'}>|</span>
                                            <span>Flight duration {computeTotalTravelTime(firstInbound, lastInbound)}</span>
                                            {inboundSegs.length > 1 && (
                                                <><span className={'mx-2'}>|</span><span>{inboundSegs.length - 1} stop</span></>
                                            )}
                                        </>
                                    )}
                                </div>
                                {firstInbound ? (
                                    <>
                                        <div className="mb-2">
                                            <span className={'fs-6 fw-semibold'}>{formatTime(firstInbound.departureTime)}</span>
                                            <span className={'mx-2'}>|</span>
                                            <span>{getCityName(firstInbound.departureAirport)}, {firstInbound.departureAirport}</span>
                                        </div>
                                        <div>
                                            <span className={'fs-6 fw-semibold'}>{formatTime(lastInbound?.arrivalTime)}</span>
                                            <span className={'mx-2'}>|</span>
                                            <span>{getCityName(lastInbound?.arrivalAirport)}, {lastInbound?.arrivalAirport}</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-muted small">
                                        Return flight included in round-trip fare
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Fare class selection cards — dynamic from API */}
                <div className="row g-3 mb-2">
                    {sortedCabins.map((cabin) => {
                        const option = cabinGroups[cabin];
                        const isSelected = activeCabin === cabin;
                        const baggage = option.fareDetails?.baggage || {};
                        const flexibility = option.fareDetails?.flexibility || {};

                        return (
                            <div className={sortedCabins.length <= 3 ? "col-md-4" : "col-md-3"} key={cabin}>
                                <div
                                    className={`bg-white rounded-3 p-3 h-100 shadow-sm ${isSelected ? 'border border-success border-2' : 'border border-light border-2'}`}
                                    style={{cursor: 'pointer'}}
                                    onClick={() => setSelectedCabin(cabin)}
                                >
                                    <div className="d-flex align-items-center justify-content-between mb-2">
                                        <h6 className="mb-0 fw-bold">{formatCabinName(cabin)}</h6>
                                        <input
                                            type="radio"
                                            name="class"
                                            value={cabin}
                                            checked={isSelected}
                                            onChange={() => setSelectedCabin(cabin)}
                                            className="custom-radio"
                                        />
                                    </div>
                                    <div className="text-muted small mb-3">
                                        {option.fareDetails?.priceClassName || ''}
                                    </div>

                                    <div className="mb-3">
                                        <strong className="d-block mb-2">Baggage included</strong>
                                        <div className="small d-flex align-items-center mb-1">
                                            <IoCheckmark className="text-success me-2" size={16} /> Personal item
                                        </div>
                                        <div className={`small d-flex align-items-center mb-1 ${!baggage.cabinBag ? 'text-muted' : ''}`}>
                                            {baggage.cabinBag ? (
                                                <IoCheckmark className="text-success me-2" size={16} />
                                            ) : (
                                                <IoCloseCircleOutline className="me-2" size={16} />
                                            )}
                                            Carry-on bag
                                        </div>
                                        <div className={`small d-flex align-items-center ${!baggage.checkedBags ? 'text-muted' : ''}`}>
                                            {baggage.checkedBags ? (
                                                <IoCheckmark className="text-success me-2" size={16} />
                                            ) : (
                                                <IoCloseCircleOutline className="me-2" size={16} />
                                            )}
                                            Check in bag
                                        </div>
                                    </div>

                                    <div className="mb-3">
                                        <strong className="d-block mb-2">Flexibility</strong>
                                        <div className={`small d-flex align-items-center mb-1 ${!flexibility.refundable ? 'text-muted' : ''}`}>
                                            {flexibility.refundable ? (
                                                <IoCheckmark className="text-success me-2" size={16} />
                                            ) : (
                                                <IoCloseCircleOutline className="me-2" size={16} />
                                            )}
                                            Cancellation
                                        </div>
                                        <div className={`small d-flex align-items-center ${!flexibility.changeable ? 'text-muted' : ''}`}>
                                            {flexibility.changeable ? (
                                                <IoCheckmark className="text-success me-2" size={16} />
                                            ) : (
                                                <IoCloseCircleOutline className="me-2" size={16} />
                                            )}
                                            Change
                                        </div>
                                    </div>

                                    <h4 className="price-tag fw-bold mb-0">
                                        {formatPrice(option.price.total, option.price.currency)}
                                    </h4>
                                    <div className="text-muted small">{isRoundTrip ? 'Round Trip' : 'One Way'}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="d-flex align-items-center justify-content-end p-1">
                    <div className="me-4">
                        <span className="text-muted">{isRoundTrip ? 'Round Trip' : 'One Way'}</span>
                        <h4 className="price-tag fw-bold d-inline ms-3">
                            {activeOption ? formatPrice(activeOption.price.total, activeOption.price.currency) : ''}
                        </h4>
                    </div>
                    <button className="btn btn-danger" onClick={handleContinue}>
                        Continue
                        <IoIosArrowForward className="ms-2" />
                    </button>
                </div>
            </Modal.Body>
        </Modal>
    );
}

export default FlightDetailsModal;
