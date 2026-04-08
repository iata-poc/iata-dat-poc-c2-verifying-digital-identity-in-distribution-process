import {BrowserRouter, Navigate, Route, Routes} from 'react-router';
import './App.css'
import { LoginPage } from "./pages/login.jsx";
import { HomePage } from "./pages/homePage.jsx";
import 'bootstrap/dist/css/bootstrap.min.css';
import {NeedHelp} from "./pages/needHelp.jsx";
import {Navigation} from "./pages/navigation.jsx";
import {AuthenticationPage} from "./pages/authentication.jsx";
import {AuthenticationProcess} from "./pages/authenticationProcess.jsx";
import {useState, useEffect} from "react";
import {SearchPage} from "./pages/searchPage.jsx";
import {PassengerInfoPage} from "./pages/passengerInfoPage.jsx";
import {ConfirmationPage} from "./pages/confirmationPage.jsx";
import {BookingSuccessPage} from "./pages/bookingSuccessPage.jsx";
import {SettingsPage} from "./pages/settingsPage.jsx";
import {clearVerificationId, clearAgencyToken, getCredentialStatus} from "./services/api.js";

export const App = () => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [loginType, setLoginType] = useState(null);
    const [credentialRevoked, setCredentialRevoked] = useState(false);

    const fetchCredentialStatus = async () => {
        try {
            const { revoked } = await getCredentialStatus(1, 5);
            setCredentialRevoked(revoked);
        } catch (err) {
            console.error('Failed to fetch credential status:', err.message);
        }
    };

    const handleLogin = (type) => {
        setLoginType(type);
        setIsLoggedIn(true);
        fetchCredentialStatus();
    };

    useEffect(() => {
        clearVerificationId();
        clearAgencyToken();
    }, []);

    useEffect(() => {
        if (loginType) {
            document.body.setAttribute('data-theme', loginType);
        } else {
            document.body.removeAttribute('data-theme');
        }
    }, [loginType]);

    return (
        <BrowserRouter>
            <div data-theme={loginType}>
                <Navigation isLoggedIn={isLoggedIn} loginType={loginType}/>
                <Routes>
                    <Route
                        index
                        element={isLoggedIn ? <HomePage/> : <Navigate to="/authentication" replace/>}
                    />
                    <Route path="/login" element={isLoggedIn ? <Navigate to="/" replace/> : <LoginPage onSuccess={() => handleLogin('agency')}/>}/>
                    <Route path="/need-help" element={<NeedHelp/>}/>
                    <Route path="/authentication" element={isLoggedIn ? <Navigate to="/" replace/> : <AuthenticationPage/>}/>
                    <Route
                        path="/authentication/scan"
                        element={
                            isLoggedIn ? (
                                <Navigate to="/" replace/>
                            ) : (
                                <AuthenticationProcess onSuccess={() => handleLogin('iata')}/>
                            )}
                    />
                    <Route path="/search" element={isLoggedIn ? <SearchPage/> : <Navigate to="/authentication" replace/>}/>
                    <Route path="/passenger-info" element={isLoggedIn ? <PassengerInfoPage/> : <Navigate to="/authentication" replace/>}/>
                    <Route path="/confirmation" element={isLoggedIn ? <ConfirmationPage/> : <Navigate to="/authentication" replace/>}/>
                    <Route path="/booking-success" element={isLoggedIn ? <BookingSuccessPage/> : <Navigate to="/authentication" replace/>}/>
                    <Route path="/settings/*" element={isLoggedIn ? <SettingsPage credentialRevoked={credentialRevoked} setCredentialRevoked={setCredentialRevoked} fetchCredentialStatus={fetchCredentialStatus}/> : <Navigate to="/authentication" replace/>}/>

                    <Route path="*" element={<Navigate to="/authentication" replace/>}/>
                </Routes>
            </div>
        </BrowserRouter>
    )
}
