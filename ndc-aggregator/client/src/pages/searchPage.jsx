import SearchForm from "../shared/searchForm.jsx";
import {IoIosArrowForward} from "react-icons/io";
import {MdOutlineWatchLater} from "react-icons/md";
import {useState, useEffect, useCallback} from "react";
import FlightDetailsModal from "./flightDetailModal.jsx";
import {useNavigate, useSearchParams} from "react-router";
import {searchFlights} from "../services/api.js";
import {
    getAirlineName,
    getAirlineLogo,
    formatTime,
    formatPrice,
    getCheapestPrice,
    computeTotalTravelTime,
} from "../services/helpers.js";

function FlightCard({ flight, searchData, isRecommended, onSelectClick }) {
    const outboundSegs = flight.segments?.filter(s => s.journeyDirection === 'outbound') || [];
    const firstOutbound = outboundSegs[0] || flight.segments?.[0];
    const lastOutbound = outboundSegs[outboundSegs.length - 1] || firstOutbound;
    const cheapest = getCheapestPrice(flight.fareOptions);

    return (
        <div className="border rounded p-4 mb-3 bg-white">
            <div className="d-flex align-items-center gap-2 mb-3">
                <img src={getAirlineLogo(flight.airlineCode)} alt={getAirlineName(flight.airlineCode)}/>
                {isRecommended && (
                    <span className="badge pop-button">Recommended</span>
                )}
            </div>

            <div className="d-flex align-items-center justify-content-between">
                <div className="text-center">
                    <div className="fs-4">{formatTime(firstOutbound?.departureTime)}</div>
                    <div className="small">{firstOutbound?.departureAirport}</div>
                </div>

                <div className="flex-grow-1 mx-4 d-flex align-items-center gap-3">
                    <div className="flex-grow-1 border-top"></div>
                    <span className="text-muted small text-nowrap">
                        <MdOutlineWatchLater className={'clock'} />
                        {computeTotalTravelTime(firstOutbound, lastOutbound)}
                        {outboundSegs.length > 1 && (
                            <span className="ms-1 text-muted">({outboundSegs.length - 1} stop)</span>
                        )}
                    </span>
                    <div className="flex-grow-1 border-top"></div>
                </div>

                <div className="text-center">
                    <div className="fs-4">{formatTime(lastOutbound?.arrivalTime)}</div>
                    <div className="small">{lastOutbound?.arrivalAirport}</div>
                </div>

                <div className="d-flex ms-5 text-end">
                    <div className={'me-4 text-start'}>
                        <div className="fs-5 price-tag">
                            {cheapest ? formatPrice(cheapest.price.total, cheapest.price.currency) : ''}
                        </div>
                        <div className="text-muted small mb-2">
                            {searchData.tripType === 'one-way' ? 'One Way' : 'Round Trip'}
                        </div>
                    </div>
                    <button className="btn btn-danger h-100" onClick={() => onSelectClick(flight)}>
                        Select
                        <IoIosArrowForward className={'ms-3'}/>
                    </button>
                </div>
            </div>
        </div>
    );
}

export const SearchPage = () => {
    const [showModal, setShowModal] = useState(false);
    const [selectedFlight, setSelectedFlight] = useState(null);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const [flights, setFlights] = useState([]);
    const [searchId, setSearchId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const searchData = {
        tripType: searchParams.get('tripType') || 'one-way',
        from: searchParams.get('from'),
        to: searchParams.get('to'),
        departureDate: searchParams.get('departureDate') || null,
        returnDate: searchParams.get('returnDate') || null,
        travelers: searchParams.get('travelers'),
    };

    const doSearch = useCallback(async () => {
        if (!searchData.from || !searchData.to || !searchData.departureDate) return;

        setLoading(true);
        setError(null);
        setFlights([]);

        try {
            const params = {
                origin: searchData.from,
                destination: searchData.to,
                departureDate: searchData.departureDate,
                passengers: [{ type: 'ADT', count: parseInt(searchData.travelers) || 1 }],
            };
            if (searchData.returnDate) {
                params.returnDate = searchData.returnDate;
            }

            const result = await searchFlights(params);
            setFlights(result.flights || []);
            setSearchId(result.searchId);
            if (result.message) {
                setError(result.message);
            }
        } catch (err) {
            console.error('Search failed:', err);
            setError('No Routes available for this input data');
        } finally {
            setLoading(false);
        }
    }, [searchData.from, searchData.to, searchData.departureDate, searchData.returnDate, searchData.travelers]);

    useEffect(() => {
        doSearch();
    }, [doSearch]);

    const handleSelectFlight = (flight) => {
        setSelectedFlight(flight);
        setShowModal(true);
    };

    const handleContinue = (bookingData) => {
        sessionStorage.setItem('bookingData', JSON.stringify(bookingData));
        navigate('/passenger-info');
    };

    return (
        <div className="search-page-wrapper pb-3">
            <div className="search-section mb-3">
                <SearchForm />
            </div>

            <div className="results-section w-100 mt-4">
                {loading && (
                    <div className="text-center py-5">
                        <div className="spinner-border text-danger" role="status">
                            <span className="visually-hidden">Searching...</span>
                        </div>
                        <p className="mt-3 text-muted">Searching airlines for the best offers...</p>
                    </div>
                )}

                {error && (
                    <div className="alert alert-warning text-center" role="alert">
                        {error}
                    </div>
                )}

                {!loading && !error && flights.length === 0 && searchData.from && searchData.to && (
                    <div className="alert alert-warning text-center" role="alert">
                        No Routes available for this input data
                    </div>
                )}

                <div>
                    {flights.map((flight, index) => (
                        <FlightCard
                            key={flight.flightGroupKey || index}
                            flight={flight}
                            searchData={searchData}
                            isRecommended={index === 0}
                            onSelectClick={handleSelectFlight}
                        />
                    ))}
                </div>
            </div>

            <FlightDetailsModal
                show={showModal}
                onHide={() => setShowModal(false)}
                flight={selectedFlight}
                searchData={searchData}
                searchId={searchId}
                onContinue={handleContinue}
            />
        </div>
    );
}
