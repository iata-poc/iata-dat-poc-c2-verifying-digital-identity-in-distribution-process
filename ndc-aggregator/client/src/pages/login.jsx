import {useState} from "react";
import {useNavigate} from "react-router";
import {Modal} from "react-bootstrap";
import {agencyLogin} from "../services/api.js";

export const LoginPage = ({onSuccess}) => {
    const navigate = useNavigate();
    const [orgName, setOrgName] = useState('');
    const [password, setPassword] = useState('');
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [loginError, setLoginError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginError('');
        setLoading(true);
        try {
            await agencyLogin(orgName, password);
            onSuccess();
            navigate('/');
        } catch (err) {
            setLoginError(err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    const handleResetSubmit = (e) => {
        e.preventDefault();
        setResetEmail('');
        setShowResetModal(false);
    };

    const isDisabled = !orgName || !password;

    return (
        <div className="agency-login-page">
            <div className="agency-login-bg">
                <img src='/main_background.jpg' alt="Background"/>
            </div>
            <div className="agency-login-card">
                <div className="agency-login-brand mb-4">
                    <span className="agency-logo">Trip<span className="agency-logo-dot">.</span>com</span>
                </div>

                <h4 className="mb-0">Internal Booking System</h4>
                <span className="powered-by-dreamix mt-1">powered by <strong>Dreamix</strong></span>
                <p className="text-muted mt-2 mb-4">
                    Sign in with your admin credentials to access the booking platform.
                </p>

                <form onSubmit={handleLogin}>
                    <input
                        type="text"
                        className="agency-login-input w-100 mt-2 p-2"
                        placeholder="Organisation name"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                    />
                    <input
                        type="password"
                        className="agency-login-input w-100 mt-3 p-2"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    {loginError && (
                        <div className="text-danger mt-2" style={{fontSize: '0.9rem'}}>
                            {loginError}
                        </div>
                    )}
                    <div className="text-end">
                        <button
                            type="button"
                            className={'need-help mt-2'}
                            onClick={() => setShowResetModal(true)}
                        >
                            Forgot password?
                        </button>
                    </div>
                    <button
                        type="submit"
                        className={'agency-login-btn w-100 mt-3 p-2'}
                        disabled={isDisabled || loading}
                    >
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </form>

            </div>
            <button className={'demo-switch-btn'} onClick={() => navigate('/authentication')}>
                Switch to Travel Agency Desktop
            </button>

            <Modal show={showResetModal} onHide={() => setShowResetModal(false)} centered>
                <Modal.Header closeButton className="border-0">
                    <Modal.Title>Reset Password</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <form onSubmit={handleResetSubmit}>
                        <input
                            type="email"
                            className="agency-login-input w-100 p-2"
                            placeholder="Email address"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                        />
                        <button
                            type="submit"
                            className={'agency-login-btn w-100 mt-3 p-2'}
                            disabled={!resetEmail}
                        >
                            Send Reset Link
                        </button>
                    </form>
                </Modal.Body>
            </Modal>
        </div>
    );
};
