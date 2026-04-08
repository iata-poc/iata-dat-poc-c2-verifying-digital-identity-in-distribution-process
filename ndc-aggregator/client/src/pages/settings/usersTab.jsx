import {useState} from "react";
import {IoSearchOutline} from "react-icons/io5";
import {LuArrowUpDown} from "react-icons/lu";
import {toggleCredentialStatus} from "../../services/api.js";

const mockUsers = [
    {id: 1, name: "John Doe", email: "john@thraciantravel.com", agency: "Thracian Travel", avatar: "/avatars/profile.jpg"},
    {id: 2, name: "Jane Smith", email: "jane@thraciantravel.com", agency: "Thracian Travel", avatar: "/avatars/2.jpg"},
    {id: 3, name: "Bob Johnson", email: "bob@thraciantravel.com", agency: "Thracian Travel", avatar: "/avatars/4.jpg"},
    {id: 4, name: "Maria Ivanova", email: "maria@thraciantravel.com", agency: "Thracian Travel", avatar: "/avatars/3.jpg"},
    {id: 5, name: "Alex Petrov", email: "alex@thraciantravel.com", agency: "Thracian Travel", avatar: "/avatars/6.jpg"},
    {id: 6, name: "Elena Georgieva", email: "elena@thraciantravel.com", agency: "Thracian Travel", avatar: "/avatars/5.jpg"},
    {id: 7, name: "Jack Doe", email: "jack@bluetravel.com", agency: "Blue Travel", avatar: "/avatars/profile.jpg"},
];

export const UsersTab = ({credentialRevoked, setCredentialRevoked, fetchCredentialStatus}) => {
    const [search, setSearch] = useState("");
    const [sortBy, setSortBy] = useState("");
    const [sortDir, setSortDir] = useState("asc");
    const [toggling, setToggling] = useState(false);

    const handleToggleCredential = async () => {
        setToggling(true);
        try {
            await toggleCredentialStatus(1, 5);
            await fetchCredentialStatus();
        } catch (err) {
            console.error('Failed to toggle credential:', err.message);
            alert('Failed to toggle credential status. Please try again.');
        } finally {
            setToggling(false);
        }
    };

    const handleSort = (column) => {
        if (sortBy === column) {
            setSortDir(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortBy(column);
            setSortDir("asc");
        }
    };

    const filteredUsers = mockUsers
        .filter(user =>
            user.name.toLowerCase().includes(search.toLowerCase()) ||
            user.email.toLowerCase().includes(search.toLowerCase()) ||
            user.agency.toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) => {
            if (!sortBy) return 0;
            const cmp = a[sortBy].localeCompare(b[sortBy]);
            return sortDir === "asc" ? cmp : -cmp;
        });

    return (
        <div className="m-4">
            <h4>Users</h4>
            <div className="p-4 mt-4">
            <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="position-relative" style={{width: '30%'}}>
                    <IoSearchOutline className="position-absolute top-50 translate-middle-y ms-2 text-muted" />
                    <input
                        type="text"
                        className="form-control ps-4"
                        placeholder="Search for travel agent..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <select
                    className="form-select form-select-sm w-auto"
                    value={sortBy}
                    onChange={(e) => { setSortBy(e.target.value); setSortDir("asc"); }}
                >
                    <option value="">Columns</option>
                    <option value="email">Email</option>
                </select>
            </div>
            <table className="table">
                <thead>
                    <tr>
                        <th className="w-25">Travel Agent Name</th>
                        <th className="w-25 cursor-pointer" onClick={() => handleSort("email")}>
                            Email <LuArrowUpDown className="ms-1" />
                        </th>
                        <th className="border-start" style={{width: '1%', whiteSpace: 'nowrap'}}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredUsers.map(user => (
                        <tr key={user.id}>
                            <td><div className="d-flex align-items-center"><img className="user me-2" src={user.avatar} alt={user.name} />{user.name}</div></td>
                            <td>{user.email}</td>
                            <td className="border-start ps-3">
                                {user.id === 7 ? (
                                    <button
                                        className={`btn btn-sm ${credentialRevoked ? 'enable-btn' : 'revoke-btn'}`}
                                        style={{whiteSpace: 'nowrap'}}
                                        disabled={toggling}
                                        onClick={handleToggleCredential}
                                    >
                                        {toggling
                                            ? 'Processing...'
                                            : credentialRevoked
                                                ? 'Enable Digital ID Card'
                                                : 'Revoke Digital ID Card'}
                                    </button>
                                ) : (
                                    <button
                                        className="btn btn-sm revoke-btn"
                                        style={{whiteSpace: 'nowrap'}}
                                        disabled
                                    >
                                        Revoke Digital ID Card
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                        <tr>
                            <td colSpan="3" className="text-center text-muted">No users found</td>
                        </tr>
                    )}
                </tbody>
            </table>
            </div>
        </div>
    );
};
