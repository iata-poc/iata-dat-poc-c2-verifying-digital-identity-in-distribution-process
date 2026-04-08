export const NeedHelp = () => {
    return (
        <div className="help-page mt-5">
            <h3 className={'pb-3'}>Need help signing in?</h3>
            <p className="intro">
                To finish signing in, approve the request in your third-party authentication app.
            </p>

            <h5>Didn’t receive a request?</h5>
            <ul>
                <li>Make sure the authentication app is installed and set up</li>
                <li>Confirm you’re signed in to the correct account</li>
                <li>Open the app manually and refresh or sync</li>
                <li>Check that your device is connected to the internet</li>
            </ul>

            <h5>Request expired or denied?</h5>
            <p>Authentication requests expire quickly for security reasons.</p>
            <ul>
                <li>Go back to the login page and try again</li>
                <li>Approve the most recent request shown in the app</li>
            </ul>

            <h5>Using the wrong app?</h5>
            <p>If you have multiple authentication apps, be sure you’re using the one linked to your account.</p>
        </div>
    );
}