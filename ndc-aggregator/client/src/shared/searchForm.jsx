import MainBackground from "../shared/mainBackground.jsx";
import {LuArrowLeftRight} from "react-icons/lu";
import {useState, useRef, useEffect} from "react";
import DatePicker from "react-datepicker";
import {IoIosArrowDown, IoIosSearch} from "react-icons/io";
import {useNavigate, useSearchParams} from "react-router";
import {FiArrowRight} from "react-icons/fi";
import {CiCalendar} from "react-icons/ci";

export const AIRPORTS = [
    { code: 'DXB', name: 'Dubai International Airport', city: 'Dubai' },
    { code: 'YYZ', name: 'Toronto Pearson International Airport', city: 'Toronto' },
    { code: 'YUL', name: 'Montréal-Pierre Elliott Trudeau International Airport', city: 'Montreal' },
    { code: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore' },
    { code: 'ZRH', name: 'Zurich Airport', city: 'Zurich' },
    { code: 'SOF', name: 'Sofia Airport', city: 'Sofia' },
    { code: 'IST', name: 'Istanbul Airport', city: 'Istanbul' },
    { code: 'LHR', name: 'London Heathrow Airport', city: 'London' },
];

function AirportSelect({ value, onChange, placeholder }) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filtered = AIRPORTS.filter((a) => {
        const q = query.toLowerCase();
        return (
            a.code.toLowerCase().includes(q) ||
            a.name.toLowerCase().includes(q) ||
            a.city.toLowerCase().includes(q)
        );
    });

    const selected = AIRPORTS.find((a) => a.code === value);
    const displayValue = open ? query : (selected ? `${selected.code} — ${selected.city}` : '');

    return (
        <div className="position-relative w-75" ref={wrapperRef}>
            <input
                className="w-100 p-2"
                type="text"
                placeholder={placeholder}
                value={displayValue}
                onChange={(e) => {
                    setQuery(e.target.value);
                    if (!open) setOpen(true);
                }}
                onFocus={() => {
                    setOpen(true);
                    setQuery('');
                }}
            />
            {open && (
                <ul
                    className="list-group position-absolute w-100 shadow"
                    style={{ zIndex: 1050, maxHeight: '220px', overflowY: 'auto' }}
                >
                    {filtered.length === 0 && (
                        <li className="list-group-item text-muted small">No airports found</li>
                    )}
                    {filtered.map((a) => (
                        <li
                            key={a.code}
                            className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center${
                                a.code === value ? ' active' : ''
                            }`}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                                onChange(a.code);
                                setQuery('');
                                setOpen(false);
                            }}
                        >
                            <div className="me-3">
                                <strong>{a.code}</strong>
                                <span className="ms-2 small">{a.city}</span>
                            </div>
                            <span className="small text-muted text-end" style={{ fontSize: '0.75rem' }}>{a.name}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function TravelerSelect({ onTravelerChange, travelers }) {
    const [value, setValue] = useState(travelers);

    const displayValue = value || travelers;

    const label = (val) => val ? `${val} Traveler${val > 1 ? "s" : ""}` : "Travelers";

    const handleSelect = (num) => {
        setValue(num);
        onTravelerChange?.(num);
    };

    return (
        <div className="dropdown w-100 ms-2">
            <button
                className="btn btn-outline-secondary w-100 custom-dropdown text-start d-flex justify-content-between align-items-center"
                type="button"
                data-bs-toggle="dropdown"
                data-bs-display="static"
                style={{ color: displayValue === null ? '#999' : '#000' }}
            >
                <span>{label(displayValue)}</span>
                <IoIosArrowDown style={{ color: '#71717A' }} />
            </button>

            <ul className="dropdown-menu w-100">
                {Array.from({ length: 5 }, (_, i) => i + 1).map((num) => (
                    <li key={num}>
                        <button
                            className="dropdown-item"
                            onClick={() => handleSelect(num)}
                        >
                            {`${num} Traveler${num > 1 ? "s" : ""}`}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function DateSelect({tripType, onDateChange, departureDate, returnDate}) {
    const [open, setOpen] = useState(false);
    const isRoundTrip = tripType === "round-trip";

    const format = (d) => {
        if (!d) return '';
        return d.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
        });
    };

    const label = isRoundTrip
        ? (departureDate && returnDate)
            ? `${format(departureDate)} – ${format(returnDate)}`
            : "Travel dates"
        : departureDate
            ? format(departureDate)
            : "Travel date";

    return (
        <div className="position-relative w-100">
            <button
                type="button"
                className={`btn btn-outline-secondary w-100 text-start custom-dropdown d-flex align-items-center justify-content-between`}
                onClick={() => setOpen(!open)}
                style={{ color: (label === "Travel date" || label === "Travel dates") ? '#999' : '#000' }}
            >
                <span className="d-flex align-items-center">
                    <CiCalendar className="me-2" style={{ fontSize: '18px', color: '#71717A' }} />
                    {label}
                </span>
                <IoIosArrowDown style={{ color: '#71717A' }} />
            </button>

            {open && (
                <div className="position-absolute mt-1" style={{zIndex: 1000, backgroundColor: 'white'}}>
                    {isRoundTrip ? (
                        <DatePicker
                            selectsRange={true}
                            startDate={departureDate}
                            endDate={returnDate}
                            onChange={(dates) => {
                                const [start, end] = dates;
                                onDateChange?.({ start: start, end: end });

                                if (start && end) {
                                    setOpen(false);
                                }
                            }}
                            inline
                            minDate={new Date()}
                            onClickOutside={() => setOpen(false)}
                        />
                    ) : (
                        <DatePicker
                            selected={departureDate}
                            onChange={(date) => {
                                onDateChange?.({ start: date, end: null });
                                setOpen(false);
                            }}
                            inline
                            minDate={new Date()}
                            onClickOutside={() => setOpen(false)}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

function BootstrapTripSwitch({ onChange }) {
    const [searchParams] = useSearchParams();
    const initialType = searchParams.get('tripType') || 'one-way';
    const [activeTab, setActiveTab] = useState(initialType);

    const handleClick = (type) => {
        setActiveTab(type);
        onChange?.(type);
    };

    return (
        <div className="d-flex justify-content-center">
            <div className="trip-switch">
                <button
                    type="button"
                    className={`tab-button ${activeTab === "one-way" ? "active" : ""}`}
                    onClick={() => handleClick("one-way")}
                >
                    One-way
                </button>
                <button
                    type="button"
                    className={`tab-button ${activeTab === "round-trip" ? "active" : ""}`}
                    onClick={() => handleClick("round-trip")}
                >
                    Round-trip
                </button>
            </div>
        </div>
    );
}

function SearchForm() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Local state for form fields — does NOT update URL until Search is clicked
    const [tripType, setTripType] = useState(searchParams.get('tripType') || 'one-way');
    const [from, setFrom] = useState(searchParams.get('from') || '');
    const [to, setTo] = useState(searchParams.get('to') || '');
    const [departureDate, setDepartureDate] = useState(
        searchParams.get('departureDate') ? new Date(searchParams.get('departureDate') + 'T00:00:00') : null
    );
    const [returnDate, setReturnDate] = useState(
        searchParams.get('returnDate') ? new Date(searchParams.get('returnDate') + 'T00:00:00') : null
    );
    const [travelers, setTravelers] = useState(
        searchParams.get('travelers') ? parseInt(searchParams.get('travelers')) : null
    );

    const formData = { from, to, departureDate, returnDate, travelers };

    const handleSearch = () => {
        const params = new URLSearchParams();
        params.append('tripType', tripType);
        if (from) params.append('from', from);
        if (to) params.append('to', to);
        if (departureDate) params.append('departureDate', `${departureDate.getFullYear()}-${String(departureDate.getMonth() + 1).padStart(2, '0')}-${String(departureDate.getDate()).padStart(2, '0')}`);
        if (returnDate) params.append('returnDate', `${returnDate.getFullYear()}-${String(returnDate.getMonth() + 1).padStart(2, '0')}-${String(returnDate.getDate()).padStart(2, '0')}`);
        if (travelers) params.append('travelers', travelers);

        navigate(`/search?${params.toString()}`);
    };

    const isSearchDisabled = !formData.from || !formData.to || !formData.departureDate || !formData.travelers
      || (tripType === 'round-trip' && !formData.returnDate);

    const handleTripTypeChange = (newTripType) => {
          setTripType(newTripType);
          setDepartureDate(null);
          setReturnDate(null);
      };

    return (
        <div className="search-form-wrapper">
            <MainBackground/>
            <div className={'content-container main-container p-3'}>
                <BootstrapTripSwitch onChange={handleTripTypeChange} />
                <div className={'d-flex mt-5'}>
                    <div className={'d-flex w-50 align-items-center'}>
                        <AirportSelect
                            value={formData.from}
                            onChange={(code) => setFrom(code)}
                            placeholder="From"
                        />
                        {tripType === "one-way" ? (
                            <FiArrowRight className={'m-1 arrows'}/>
                        ) : (
                            <LuArrowLeftRight className={'m-1 arrows'}/>
                        )}
                        <AirportSelect
                            value={formData.to}
                            onChange={(code) => setTo(code)}
                            placeholder="To"
                        />
                    </div>
                    <div className="dropdown d-flex w-50 ms-2">
                        <DateSelect
                            tripType={tripType}
                            departureDate={formData.departureDate}
                            returnDate={formData.returnDate}
                            onDateChange={(dates) => {
                                setDepartureDate(dates.start || null);
                                setReturnDate(dates.end || null);
                            }}
                        />

                        <TravelerSelect
                            travelers={formData.travelers}
                            onTravelerChange={(value) => setTravelers(value)}
                        />
                    </div>
                </div>
                <div className={'self-end mt-5 text-end'}>
                    <button className={'search'} onClick={handleSearch} disabled={isSearchDisabled}>
                        <IoIosSearch className={'me-1'} />
                        Search
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SearchForm;
