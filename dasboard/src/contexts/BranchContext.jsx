import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../services/api';

const BranchContext = createContext();

export const useBranch = () => {
    const context = useContext(BranchContext);
    if (!context) {
        throw new Error('useBranch must be used within a BranchProvider');
    }
    return context;
};

export const BranchProvider = ({ children }) => {
    const [branches, setBranches] = useState([]);
    const [activeBranchId, setActiveBranchId] = useState(
        localStorage.getItem('activeBranchId') || 'all'
    );
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const response = await api.get('/branches');
            const branchList = response.data || [];
            setBranches(branchList);

            // If user only has access to a single branch (Branch Admin), lock activeBranchId to that branch
            if (branchList.length === 1) {
                const singleBranchId = branchList[0].id.toString();
                if (activeBranchId.toString() !== singleBranchId) {
                    setActiveBranchId(singleBranchId);
                    localStorage.setItem('activeBranchId', singleBranchId);
                }
            } else if (activeBranchId !== 'all' && branchList.length > 0) {
                const isValid = branchList.some(b => b.id.toString() === activeBranchId.toString());
                if (!isValid) {
                    const fallbackId = branchList[0].id.toString();
                    setActiveBranchId(fallbackId);
                    localStorage.setItem('activeBranchId', fallbackId);
                }
            }
        } catch (error) {
            console.error('Error fetching branches:', error);
        } finally {
            setLoading(false);
        }
    };

    const switchBranch = (branchId) => {
        // If user is a branch admin with only 1 branch, do not allow switching
        if (branches.length <= 1) {
            return;
        }
        setActiveBranchId(branchId);
        localStorage.setItem('activeBranchId', branchId);
        // Force a page reload or trigger a global data refresh
        window.location.reload();
    };

    const activeBranch = branches.find(b => b.id.toString() === activeBranchId.toString()) || (branches.length === 1 ? branches[0] : null);

    return (
        <BranchContext.Provider value={{
            branches,
            activeBranchId,
            activeBranch,
            switchBranch,
            loading,
            refreshBranches: fetchBranches
        }}>
            {children}
        </BranchContext.Provider>
    );
};
