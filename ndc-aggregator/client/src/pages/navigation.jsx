import {Link, useLocation} from "react-router";
import TitleHeader from "../shared/titleHeader.jsx";
import { GrLanguage } from "react-icons/gr";
import { IoSettingsSharp } from "react-icons/io5";

function PoweredByDreamix() {
    return <span className="powered-by-dreamix">powered by <strong>Dreamix</strong></span>;
}

function AgencyLogo({isLoggedIn}){
    const location = useLocation();
    const backTo = location.state?.from || (isLoggedIn ? "/" : "");

    return (
        <Link className={'links'} to={backTo}>
            <span className="agency-logo">Trip<span className="agency-logo-dot">.</span>com</span>
        </Link>
    );
}

const minimalNavRoutes = ["/need-help", "/authentication", "/authentication/scan"];

function AdditionalNavigationContent({location, isLoggedIn, loginType}){
    return !minimalNavRoutes.includes(location) ?
       <>
           <div className={'d-flex align-items-center me-5'}>
               {loginType === 'agency' ? (
                   <AgencyLogo isLoggedIn={isLoggedIn} />
               ) : (
                   <div className="brand-with-powered">
                       <div className="d-flex align-items-center">
                           <img src="/DREAMIXtravel-logo-ALL-03.png" alt="Dreamix Travel logo" style={{height: 44}}/>
                       </div>
                   </div>
               )}
           </div>
           <div className={'d-flex  align-items-center'}>
               <Link to={'/'} className={'links me-4'}>Bookings</Link>
               <Link to={'/'} className={'links me-4'}>Customer Support</Link>
               <Link to={'/'} className={'links me-4'}>Help</Link>
           </div>
           <div className={'d-flex ms-5 align-items-center'}>
               <button className={'d-flex me-3 language-change'}>
                   <GrLanguage className={'align-self-center me-2'}/>
                   EN
               </button>

               {loginType === 'agency' && <Link to={'/settings'} className={'links me-3'}><IoSettingsSharp size={24} /></Link>}
               {loginType !== 'agency' && <img className={'user'} src="/avatars/profile.jpg" alt="Profile Image"/>}
           </div>
       </>
    :
        <>
            <div className={'d-flex ms-4'}>
                {loginType === 'agency' ? (
                    <AgencyLogo isLoggedIn={isLoggedIn} />
                ) : (
                    <div className="brand-with-powered">
                        <div className="d-flex align-items-center">
                            <img src="/DREAMIXtravel-logo-ALL-03.png" alt="Dreamix Travel logo" style={{height: 44}}/>
                        </div>
                    </div>
                )}
            </div>
        </>;
}

export const Navigation = ({isLoggedIn, loginType}) => {
    const location = useLocation();
    const hideNavbarRoutes = ["/", "/login", "/authentication"];
    const shouldHideNavbar = hideNavbarRoutes.includes(location.pathname);

    if (shouldHideNavbar && !isLoggedIn) {
        return null;
    }

    const stylingClasses = !minimalNavRoutes.includes(location.pathname) ? 'navbar my-3 justify-content-center' : 'navbar my-3 '

    return (
        <>
            <nav className={stylingClasses}>
                <div className={'d-flex'}>
                    <AdditionalNavigationContent location={location.pathname} isLoggedIn={isLoggedIn} loginType={loginType} />
                </div>
            </nav>
        </>
    );
}
