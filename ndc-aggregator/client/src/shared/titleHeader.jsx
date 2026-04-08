import {Link, useLocation} from "react-router";

function TitleHeader({ title, isLink = false, isLoggedIn = false }) {
    const location = useLocation();
    const backTo = location.state?.from || (isLoggedIn ? "/" : "");

    return isLink ?
        <Link className={'links'} to={backTo}>
            <p className="login-header">
                {title}
            </p>
        </Link> :
        <h5 className="login-header">{title}</h5>;
}

export default TitleHeader;
