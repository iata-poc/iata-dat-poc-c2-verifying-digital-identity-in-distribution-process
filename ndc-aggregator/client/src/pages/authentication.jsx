import {useNavigate} from "react-router";

export const AuthenticationPage = () => {
    const navigate = useNavigate();

    return (
        <div className="content p-2">
            <div className="left-panel w-50">
                <img src='/login-redesign.jpeg' alt="Login image"/>
            </div>
            <div className="right-panel w-50">
                <div className={'login-panel'}>
                    <div className="brand-with-powered">
                        <div className={'d-flex'}>
                            <img src="/DREAMIXtravel-logo-ALL-03.png" alt="Dreamix Travel logo" style={{height: 50, marginLeft: -12}}/>
                        </div>
                    </div>

                    <h4 className={'mt-4 mb-0'}>Welcome back to our Travel Agency Desktop</h4>
                    <span className="powered-by-dreamix mt-1">powered by <strong>Dreamix</strong></span>
                    <p className="text-muted mt-2">
                        Use your IATA Digital Identity card to securely log in and access the booking system.
                    </p>

                    <button
                        className={'login-button w-100 mt-4 p-2 d-flex align-items-center justify-content-center'}
                        onClick={() => navigate('/authentication/scan')}
                    >
                        <img className={'me-2'} src="/iata_logo.svg.svg" alt={'IATA logo'} style={{height: 20}}/>
                        <span>Login with IATA ID Card</span>
                    </button>

                </div>
            </div>
            <button className={'demo-switch-btn'} onClick={() => navigate('/login')}>
                Switch to Internal Booking System
            </button>
        </div>
    );
}
