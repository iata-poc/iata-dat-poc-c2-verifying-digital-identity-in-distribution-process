import {useNavigate} from "react-router";
import {useState, useEffect, useRef, useCallback} from "react";
import {QRCodeSVG} from "qrcode.react";
import MainBackground from "../shared/mainBackground.jsx";
import {createVerification, checkVerificationStatus, setVerificationId as storeVerificationId} from "../services/api.js";

const POLLING_INTERVAL = 3000;
const POLLING_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export const AuthenticationProcess = ({onSuccess}) => {
    const navigate = useNavigate();
    const [qrContent, setQrContent] = useState(null);
    const [verificationId, setVerificationId] = useState(null);
    const [status, setStatus] = useState('idle'); // idle | loading | polling | verified | error
    const [errorMsg, setErrorMsg] = useState(null);
    const pollingRef = useRef(null);
    const pollingStartRef = useRef(null);

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);

    const startVerification = useCallback(async () => {
        stopPolling();
        setStatus('loading');
        setErrorMsg(null);
        setQrContent(null);

        try {
            const result = await createVerification('agency_desktop');
            setQrContent(result.qrContent);
            setVerificationId(result.id);
            setStatus('polling');
        } catch (err) {
            console.error('Failed to start verification:', err);
            setErrorMsg(err.message);
            setStatus('error');
        }
    }, [stopPolling]);

    // Start verification on mount
    useEffect(() => {
        startVerification();
        return () => stopPolling();
    }, [startVerification, stopPolling]);

    // Poll for status once we have a verificationId
    useEffect(() => {
        if (status !== 'polling' || !verificationId) return;

        pollingStartRef.current = Date.now();

        const poll = async () => {
            // Check for polling timeout
            if (Date.now() - pollingStartRef.current > POLLING_TIMEOUT) {
                stopPolling();
                setErrorMsg('Verification timed out. Please try again.');
                setStatus('error');
                return;
            }

            try {
                const result = await checkVerificationStatus(verificationId);
                if (result.state === 'VERIFIED') {
                    stopPolling();
                    setStatus('verified');
                    storeVerificationId(verificationId);
                    onSuccess?.();
                    navigate('/');
                } else if (result.state === 'FAILED') {
                    stopPolling();
                    setErrorMsg(result.reason || 'Credential verification failed. The credential may be revoked or invalid.');
                    setStatus('error');
                } else if (result.state === 'ERROR') {
                    stopPolling();
                    setErrorMsg(result.reason || 'Verification failed. Please try again.');
                    setStatus('error');
                }
            } catch (err) {
                console.error('Polling error:', err);
                stopPolling();
                setErrorMsg(err.message || 'Verification check failed. Please try again.');
                setStatus('error');
            }
        };

        pollingRef.current = setInterval(poll, POLLING_INTERVAL);
        return () => stopPolling();
    }, [status, verificationId, onSuccess, navigate, stopPolling]);

    return (
        <>
            <div className={'auth-process-container'}>
                <MainBackground/>
                <div className={'content-container d-flex h-50 w-50 p-5 mb-0'}>
                    <div className={'w-50 d-flex flex-column me-3'}>
                        <h4> Scan QR code to proceed </h4>
                        <p className={'mt-4'}>
                            Use your phone's camera or wallet app to scan the code.
                            Once scanned, your credentials will be verified automatically.
                        </p>

                        {status === 'polling' && (
                            <p className="text-muted small mt-2">
                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                Waiting for verification...
                            </p>
                        )}

                        {status === 'error' && (
                            <div className="alert alert-danger mt-2" role="alert">
                                {errorMsg || 'Something went wrong.'}
                            </div>
                        )}

                        <div className={'d-flex flex-column mt-auto'}>
                            <button
                                onClick={startVerification}
                                className={'menu-button p-2 w-100'}
                                disabled={status === 'loading'}
                            >
                                {status === 'loading' ? 'Generating...' : 'Generate new code'}
                            </button>
                            <button className={'need-help mt-3 align-self-center'} onClick={() => navigate("/authentication")}>
                                Back
                            </button>
                        </div>
                    </div>
                    <div className={'w-50 d-flex align-items-center justify-content-center'}>
                        {status === 'loading' && (
                            <div className="spinner-border text-primary" role="status">
                                <span className="visually-hidden">Loading...</span>
                            </div>
                        )}
                        {qrContent && status !== 'loading' && (
                            <QRCodeSVG value={qrContent} size={256} level="M" />
                        )}
                        {status === 'error' && !qrContent && (
                            <p className="text-muted">QR code unavailable</p>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}