import {Link, Routes, Route, useLocation} from "react-router";
import {SettingsTab} from "./settings/settingsTab.jsx";
import {UsersTab} from "./settings/usersTab.jsx";
import {IoBagRemoveOutline} from "react-icons/io5";
import {MdOutlineAnalytics} from "react-icons/md";
import {AiOutlineInbox} from "react-icons/ai";
import {FiUsers} from "react-icons/fi";
import {IoSettingsOutline} from "react-icons/io5";
import {HiOutlineSupport} from "react-icons/hi";

const sidebarTabs = [
    {label: "Bookings", icon: <IoBagRemoveOutline />},
    {label: "Analytics", icon: <MdOutlineAnalytics />},
    {label: "Logos", icon: <AiOutlineInbox />},
    {label: "Users", path: "/settings/users", icon: <FiUsers />},
    {divider: true},
    {label: "Settings", path: "/settings", icon: <IoSettingsOutline />},
    {label: "Support", icon: <HiOutlineSupport />},
];

export const SettingsPage = ({credentialRevoked, setCredentialRevoked, fetchCredentialStatus}) => {
    const location = useLocation();

    return (
        <div className="settings-layout">
            <nav className="settings-sidebar">
                {sidebarTabs.map((tab, index) => {
                    if (tab.divider) return <hr key={index} className="settings-sidebar-divider" />;

                    if (!tab.path) return (
                        <span key={tab.label} className="settings-sidebar-link disabled">
                            {tab.icon}<span className="ms-2">{tab.label}</span>
                        </span>
                    );

                    const isActive = tab.path === location.pathname;

                    return (
                        <Link
                            key={tab.label}
                            to={tab.path}
                            className={`settings-sidebar-link${isActive ? " active" : ""}`}
                        >
                            {tab.icon}<span className="ms-2">{tab.label}</span>
                        </Link>
                    );
                })}
            </nav>
            <div className="settings-content">
                <Routes>
                    <Route index element={<SettingsTab />}/>
                    <Route path="users" element={<UsersTab credentialRevoked={credentialRevoked} setCredentialRevoked={setCredentialRevoked} fetchCredentialStatus={fetchCredentialStatus}/>}/>
                </Routes>
            </div>
        </div>
    );
};
